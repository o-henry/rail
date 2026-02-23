#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFile, chmod, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROFILE_ROOT =
  process.env.RAIL_WEB_PROFILE_ROOT ||
  path.join(os.homedir(), '.rail', 'providers');
const LOG_PATH =
  process.env.RAIL_WEB_LOG_PATH ||
  path.join(os.homedir(), '.rail', 'web-worker.log');
const DEFAULT_TIMEOUT_MS = 90_000;

const state = {
  providers: new Map(),
  activeRun: null,
  lastError: null,
};

async function hardenDir(dirPath) {
  await mkdir(dirPath, { recursive: true, mode: 0o700 });
  try {
    await chmod(dirPath, 0o700);
  } catch {
    // ignore on platforms/filesystems that do not support chmod
  }
}

async function hardenFile(filePath) {
  try {
    await chmod(filePath, 0o600);
  } catch {
    // ignore on platforms/filesystems that do not support chmod
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function logLine(message) {
  const line = `[${nowIso()}] ${message}\n`;
  try {
    await hardenDir(path.dirname(LOG_PATH));
    await appendFile(LOG_PATH, line, { encoding: 'utf8', mode: 0o600 });
    await hardenFile(LOG_PATH);
  } catch {
    // ignore logging errors
  }
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function notify(method, params = {}) {
  writeJson({ jsonrpc: '2.0', method, params });
}

function respond(id, result) {
  writeJson({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message, data = null) {
  writeJson({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  });
}

function workerError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

let playwrightPromise = null;
async function loadPlaywright() {
  if (playwrightPromise) {
    return playwrightPromise;
  }

  playwrightPromise = (async () => {
    try {
      return await import('playwright');
    } catch {
      try {
        return await import('playwright-core');
      } catch {
        throw workerError(
          'BROWSER_MISSING',
          'playwright 또는 playwright-core 모듈을 찾을 수 없습니다. `npm i playwright-core` 후 재시도하세요.',
        );
      }
    }
  })();

  return playwrightPromise;
}

function chromeExecutableCandidates() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
}

function resolveChromeExecutable() {
  return chromeExecutableCandidates().find((candidate) => existsSync(candidate)) || null;
}

function providerProfileDir(provider) {
  return path.join(PROFILE_ROOT, `${provider}-profile`);
}

function sanitizeUrlForUi(rawUrl) {
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function inferSessionState(provider, sanitizedUrl, contextOpen = true) {
  if (!contextOpen) {
    return 'unknown';
  }
  if (!sanitizedUrl) {
    return 'unknown';
  }
  const lower = sanitizedUrl.toLowerCase();
  if (provider === 'gemini') {
    if (lower.includes('accounts.google.com')) {
      return 'login_required';
    }
    if (lower.includes('gemini.google.com')) {
      return 'active';
    }
  }
  return 'unknown';
}

async function ensureProviderContext(provider) {
  if (provider !== 'gemini') {
    throw workerError('UNSUPPORTED_PROVIDER', `지원하지 않는 provider입니다: ${provider}`);
  }

  const current = state.providers.get(provider);
  if (current && !current.contextClosed) {
    if (!current.page || current.page.isClosed()) {
      current.page = current.context.pages()[0] ?? (await current.context.newPage());
    }
    return current;
  }

  const playwrightModule = await loadPlaywright();
  const chromium = playwrightModule.chromium ?? playwrightModule.default?.chromium;
  if (!chromium) {
    throw workerError('BROWSER_MISSING', 'chromium 런처를 찾지 못했습니다.');
  }

  const profileDir = providerProfileDir(provider);
  await hardenDir(profileDir);

  const launchOptions = {
    headless: false,
    viewport: { width: 1380, height: 900 },
    args: ['--disable-dev-shm-usage', '--no-first-run'],
  };

  const executablePath = resolveChromeExecutable();
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  notify('web/progress', {
    provider,
    stage: 'launch_context',
    message: '브라우저 컨텍스트를 준비합니다.',
  });

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, launchOptions);
  } catch (error) {
    throw workerError(
      'BROWSER_MISSING',
      `브라우저 컨텍스트 시작 실패: ${String(error)}`,
      { executablePath },
    );
  }

  const page = context.pages()[0] ?? (await context.newPage());
  const wrapped = {
    provider,
    context,
    page,
    profileDir,
    contextClosed: false,
  };

  context.on('close', () => {
    wrapped.contextClosed = true;
  });

  state.providers.set(provider, wrapped);
  return wrapped;
}

async function waitForFirstVisible(page, selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        const count = await locator.count();
        if (count > 0 && (await locator.isVisible())) {
          return locator;
        }
      } catch {
        // continue
      }
    }
    await page.waitForTimeout(200);
  }
  return null;
}

async function isLikelyNotLoggedIn(page) {
  const loginSignals = [
    'input[type="email"]',
    'button:has-text("Sign in")',
    'a:has-text("Sign in")',
    'text=/로그인|Sign in|계정 선택/i',
  ];
  for (const selector of loginSignals) {
    const locator = page.locator(selector).first();
    try {
      const count = await locator.count();
      if (count > 0 && (await locator.isVisible())) {
        return true;
      }
    } catch {
      // continue
    }
  }

  return /accounts\.google\.com/.test(page.url());
}

async function ensureGeminiPage(page) {
  const candidates = ['https://gemini.google.com/app', 'https://gemini.google.com/'];
  for (const url of candidates) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      return;
    } catch {
      // try next
    }
  }
  throw workerError('NAVIGATION_FAILED', 'Gemini 페이지로 이동하지 못했습니다.');
}

async function fillPromptAndSubmit(page, prompt) {
  const inputSelectors = [
    'textarea[aria-label*="prompt" i]',
    'textarea[aria-label*="질문" i]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-label*="prompt" i]',
    'rich-textarea div[contenteditable="true"]',
    'textarea',
  ];

  const input = await waitForFirstVisible(page, inputSelectors, 15_000);
  if (!input) {
    const notLoggedIn = await isLikelyNotLoggedIn(page);
    if (notLoggedIn) {
      throw workerError('NOT_LOGGED_IN', 'Gemini 로그인 상태를 확인할 수 없습니다. 먼저 로그인하세요.');
    }
    throw workerError('INPUT_NOT_FOUND', 'Gemini 입력창을 찾지 못했습니다.');
  }

  notify('web/progress', {
    provider: 'gemini',
    stage: 'input_found',
    message: '입력창을 찾았습니다.',
  });

  await input.click({ timeout: 5_000 });
  const isTextarea = await input.evaluate((el) => el.tagName.toLowerCase() === 'textarea');
  const commandKey = process.platform === 'darwin' ? 'Meta' : 'Control';

  if (isTextarea) {
    await input.fill(prompt);
  } else {
    await page.keyboard.press(`${commandKey}+A`);
    await page.keyboard.press('Backspace');
    await input.type(prompt, { delay: 4 });
  }

  notify('web/progress', {
    provider: 'gemini',
    stage: 'prompt_filled',
    message: '프롬프트를 입력했습니다.',
  });

  const submitSelectors = [
    'button[aria-label*="Send" i]',
    'button[aria-label*="전송" i]',
    'button:has-text("Send")',
  ];

  for (const selector of submitSelectors) {
    const button = page.locator(selector).first();
    try {
      if ((await button.count()) > 0 && (await button.isVisible())) {
        await button.click({ timeout: 5_000 });
        return;
      }
    } catch {
      // continue to next selector
    }
  }

  try {
    await page.keyboard.press('Enter');
  } catch (error) {
    throw workerError('SUBMIT_FAILED', `전송 동작 실패: ${String(error)}`);
  }
}

async function extractGeminiResponseText(page, prompt) {
  const candidates = await page.evaluate(() => {
    const selectors = [
      '[data-message-author-role="model"]',
      'model-response',
      'main article',
      'main .markdown',
    ];

    const rows = [];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const text = (node.innerText || '').trim();
        if (!text) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        rows.push({
          text,
          top: rect.top,
          bottom: rect.bottom,
          len: text.length,
        });
      }
    }
    rows.sort((a, b) => a.bottom - b.bottom);
    return rows.slice(-12);
  });

  const promptTrimmed = prompt.trim();
  const filtered = candidates
    .map((item) => item.text.trim())
    .filter((text) => text.length >= 24)
    .filter((text) => text !== promptTrimmed)
    .filter((text) => !promptTrimmed || !text.startsWith(promptTrimmed));

  if (filtered.length === 0) {
    return null;
  }

  return filtered[filtered.length - 1];
}

async function waitForGeminiResponse(page, prompt, timeoutMs, runToken) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  let lastChangeAt = Date.now();

  while (Date.now() < deadline) {
    if (runToken.cancelled) {
      throw workerError('CANCELLED', '요청이 취소되었습니다.');
    }

    const text = await extractGeminiResponseText(page, prompt);
    if (text) {
      if (text !== lastText) {
        lastText = text;
        lastChangeAt = Date.now();
        notify('web/progress', {
          provider: 'gemini',
          stage: 'response_streaming',
          message: `응답 수집 중 (${text.length} chars)`,
        });
      } else if (Date.now() - lastChangeAt >= 1600) {
        return text;
      }
    }

    await page.waitForTimeout(450);
  }

  throw workerError('TIMEOUT', `응답 대기 시간이 초과되었습니다 (${timeoutMs}ms).`);
}

async function runGemini({ prompt, timeoutMs }) {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const provider = 'gemini';
  const runToken = { cancelled: false, provider };
  state.activeRun = runToken;

  try {
    const wrapped = await ensureProviderContext(provider);
    const { page } = wrapped;

    notify('web/progress', {
      provider,
      stage: 'navigation',
      message: 'Gemini 페이지를 준비합니다.',
    });
    await ensureGeminiPage(page);

    notify('web/progress', {
      provider,
      stage: 'input',
      message: '프롬프트 입력을 시작합니다.',
    });
    await fillPromptAndSubmit(page, prompt);

    notify('web/progress', {
      provider,
      stage: 'await_response',
      message: '응답을 기다리는 중입니다.',
    });
    const text = await waitForGeminiResponse(page, prompt, timeoutMs, runToken);

    const finishedAt = nowIso();
    return {
      ok: true,
      text,
      raw: {
        provider,
      },
      meta: {
        provider,
        url: page.url(),
        startedAt,
        finishedAt,
        elapsedMs: Date.now() - startedMs,
        extractionStrategy: 'dom-bottom-most-stable-text',
      },
    };
  } finally {
    if (state.activeRun === runToken) {
      state.activeRun = null;
    }
  }
}

async function openProviderSession(provider) {
  if (provider !== 'gemini') {
    throw workerError('UNSUPPORTED_PROVIDER', `지원하지 않는 provider입니다: ${provider}`);
  }
  const wrapped = await ensureProviderContext(provider);
  await ensureGeminiPage(wrapped.page);
  try {
    await wrapped.page.bringToFront();
  } catch {
    // ignore
  }

  const safeUrl = sanitizeUrlForUi(wrapped.page.url());
  notify('web/progress', {
    provider,
    stage: 'session_open',
    message: '로그인 세션 창을 열었습니다.',
  });
  return {
    ok: true,
    provider,
    url: safeUrl,
    sessionState: inferSessionState(provider, safeUrl),
  };
}

async function getHealthResult() {
  const providerStatuses = {};
  for (const [provider, wrapped] of state.providers.entries()) {
    const contextOpen = !wrapped.contextClosed;
    const safeUrl = contextOpen ? sanitizeUrlForUi(wrapped.page?.url?.() ?? null) : null;
    providerStatuses[provider] = {
      contextOpen,
      profileDir: wrapped.profileDir,
      url: safeUrl,
      sessionState: inferSessionState(provider, safeUrl, contextOpen),
    };
  }

  return {
    running: true,
    lastError: state.lastError,
    providers: providerStatuses,
    logPath: LOG_PATH,
    profileRoot: PROFILE_ROOT,
    activeProvider: state.activeRun?.provider ?? null,
  };
}

async function resetProviderSession(provider) {
  const wrapped = state.providers.get(provider);
  if (wrapped) {
    try {
      await wrapped.context.close();
    } catch {
      // ignore
    }
    wrapped.contextClosed = true;
    state.providers.delete(provider);
  }

  const profileDir = providerProfileDir(provider);
  await rm(profileDir, { recursive: true, force: true });
  await hardenDir(profileDir);

  return { ok: true, provider, profileDir };
}

async function cancelProviderRun(provider) {
  if (!state.activeRun || state.activeRun.provider !== provider) {
    return { ok: true, cancelled: false };
  }

  state.activeRun.cancelled = true;
  return { ok: true, cancelled: true };
}

async function handleRpcRequest(message) {
  const { id, method, params = {} } = message;

  if (method === 'health') {
    const result = await getHealthResult();
    respond(id, result);
    return;
  }

  if (method === 'provider/run') {
    const provider = String(params.provider ?? '').trim().toLowerCase();
    const prompt = String(params.prompt ?? '');
    const timeoutMs = Number(params.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    if (!provider) {
      respond(id, {
        ok: false,
        errorCode: 'UNSUPPORTED_PROVIDER',
        error: 'provider가 비어 있습니다.',
      });
      return;
    }

    if (provider !== 'gemini') {
      respond(id, {
        ok: false,
        errorCode: 'UNSUPPORTED_PROVIDER',
        error: `현재 자동화는 Gemini만 지원합니다. provider=${provider}`,
      });
      return;
    }

    if (!prompt.trim()) {
      respond(id, {
        ok: false,
        errorCode: 'INVALID_PROMPT',
        error: 'prompt가 비어 있습니다.',
      });
      return;
    }

    try {
      const result = await runGemini({
        prompt,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
      });
      respond(id, result);
    } catch (error) {
      const code = error?.code || 'EXTRACTION_FAILED';
      const messageText = error?.message || String(error);
      state.lastError = `${code}: ${messageText}`;
      notify('web/progress', {
        provider,
        stage: 'error',
        message: state.lastError,
      });
      respond(id, {
        ok: false,
        errorCode: code,
        error: messageText,
        meta: {
          provider,
          failedAt: nowIso(),
        },
      });
    }
    return;
  }

  if (method === 'provider/openSession') {
    const provider = String(params.provider ?? '').trim().toLowerCase();
    if (!provider) {
      respond(id, { ok: false, error: 'provider가 비어 있습니다.' });
      return;
    }
    try {
      const result = await openProviderSession(provider);
      respond(id, result);
    } catch (error) {
      const code = error?.code || 'INTERNAL';
      const messageText = error?.message || String(error);
      respond(id, { ok: false, errorCode: code, error: messageText });
    }
    return;
  }

  if (method === 'provider/resetSession') {
    const provider = String(params.provider ?? '').trim().toLowerCase();
    if (!provider) {
      respond(id, { ok: false, error: 'provider가 비어 있습니다.' });
      return;
    }

    try {
      const result = await resetProviderSession(provider);
      respond(id, result);
    } catch (error) {
      respond(id, {
        ok: false,
        error: `세션 리셋 실패: ${String(error)}`,
      });
    }
    return;
  }

  if (method === 'provider/cancel') {
    const provider = String(params.provider ?? '').trim().toLowerCase();
    const result = await cancelProviderRun(provider);
    respond(id, result);
    return;
  }

  respondError(id, -32601, `Method not found: ${method}`);
}

async function handleLine(rawLine) {
  const line = rawLine.trim();
  if (!line) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    await logLine(`invalid json: ${line}`);
    return;
  }

  const id = parsed.id;
  const method = parsed.method;
  if (typeof id === 'undefined' || typeof method !== 'string') {
    respondError(id ?? null, -32600, 'Invalid request');
    return;
  }

  try {
    await handleRpcRequest(parsed);
  } catch (error) {
    const message = error?.message || String(error);
    const code = error?.code || 'INTERNAL';
    state.lastError = `${code}: ${message}`;
    respond(id, {
      ok: false,
      errorCode: code,
      error: message,
    });
  }
}

async function bootstrap() {
  await hardenDir(PROFILE_ROOT);
  await logLine('web worker boot');
  notify('web/worker/started', {
    profileRoot: PROFILE_ROOT,
    logPath: LOG_PATH,
    startedAt: nowIso(),
  });

  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    void handleLine(line);
  });

  rl.on('close', async () => {
    notify('web/worker/stopped', { stoppedAt: nowIso() });
    await logLine('web worker stdin closed');
    process.exit(0);
  });
}

process.on('uncaughtException', (error) => {
  state.lastError = `uncaughtException: ${String(error)}`;
  notify('web/worker/error', { message: state.lastError });
});

process.on('unhandledRejection', (error) => {
  state.lastError = `unhandledRejection: ${String(error)}`;
  notify('web/worker/error', { message: state.lastError });
});

bootstrap().catch((error) => {
  const message = `bootstrap failed: ${String(error)}`;
  notify('web/worker/error', { message });
  process.exit(1);
});
