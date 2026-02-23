#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFile, chmod, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROFILE_ROOT =
  process.env.RAIL_WEB_PROFILE_ROOT ||
  path.join(os.homedir(), '.rail', 'providers');
const LOG_PATH =
  process.env.RAIL_WEB_LOG_PATH ||
  path.join(os.homedir(), '.rail', 'web-worker.log');
const SYSTEM_CHROME_PROFILE_OVERRIDE = process.env.RAIL_WEB_SYSTEM_CHROME_PROFILE || '';
const SYSTEM_CHROME_PROFILE_DEFAULT = resolveSystemChromeUserDataDir();
const SYSTEM_CHROME_PROFILE_DIR =
  SYSTEM_CHROME_PROFILE_OVERRIDE.trim() || SYSTEM_CHROME_PROFILE_DEFAULT || '';
const USE_SYSTEM_CHROME_PROFILE =
  (process.env.RAIL_WEB_USE_SYSTEM_CHROME_PROFILE ?? '1') !== '0' &&
  Boolean(SYSTEM_CHROME_PROFILE_DIR);
const DEFAULT_TIMEOUT_MS = 90_000;
const WORKER_LOCK_PATH = path.join(PROFILE_ROOT, 'worker.lock.json');
const SESSION_PROVIDER_CONFIG = {
  gemini: {
    homeUrls: ['https://gemini.google.com/app', 'https://gemini.google.com/'],
    activeSignals: ['gemini.google.com/app'],
    loginSignals: ['accounts.google.com'],
  },
  gpt: {
    homeUrls: ['https://chatgpt.com/'],
    activeSignals: ['chatgpt.com'],
    loginSignals: ['auth.openai.com', 'chatgpt.com/auth'],
  },
  grok: {
    homeUrls: ['https://grok.com/'],
    activeSignals: ['grok.com'],
    loginSignals: ['accounts.x.com', 'x.com/i/flow/login', 'grok.com/login'],
  },
  perplexity: {
    homeUrls: ['https://www.perplexity.ai/'],
    activeSignals: ['perplexity.ai'],
    loginSignals: ['perplexity.ai/sign-in', 'perplexity.ai/login'],
  },
  claude: {
    homeUrls: ['https://claude.ai/'],
    activeSignals: ['claude.ai'],
    loginSignals: ['claude.ai/login'],
  },
};

const PROVIDER_AUTOMATION_CONFIG = {
  gemini: {
    inputSelectors: [
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="질문" i]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][aria-label*="prompt" i]',
      'rich-textarea div[contenteditable="true"]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[aria-label*="전송" i]',
      'button:has-text("Send")',
    ],
    responseSelectors: [
      '[data-message-author-role="model"]',
      'model-response',
      'main article',
      'main .markdown',
    ],
  },
  gpt: {
    inputSelectors: [
      '#prompt-textarea',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="메시지" i]',
      'div[contenteditable="true"][id*="prompt" i]',
      'textarea',
    ],
    submitSelectors: [
      'button[data-testid*="send" i]',
      'button[aria-label*="Send" i]',
      'button:has-text("Send")',
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      'article[data-testid*="conversation-turn"]',
      'main article',
      'main .markdown',
    ],
  },
  grok: {
    inputSelectors: [
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="질문" i]',
      'div[contenteditable="true"]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
      'button:has-text("Send")',
    ],
    responseSelectors: [
      'main article',
      '[data-testid*="message"]',
      '.markdown',
      '.prose',
    ],
  },
  perplexity: {
    inputSelectors: [
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="질문" i]',
      'div[contenteditable="true"]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label*="Submit" i]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="submit" i]',
      'button:has-text("Submit")',
    ],
    responseSelectors: [
      'main article',
      '[data-testid*="answer" i]',
      '.markdown',
      '.prose',
    ],
  },
  claude: {
    inputSelectors: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="메시지" i]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
      'button:has-text("Send")',
    ],
    responseSelectors: [
      'main article',
      '[data-testid*="message" i]',
      '.markdown',
      '.prose',
    ],
  },
};

const state = {
  providers: new Map(),
  activeRun: null,
  lastError: null,
};

let lockHeld = false;
let shutdownRequested = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  if (pid === process.pid) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminatePid(pid) {
  if (!isPidAlive(pid) || pid === process.pid) {
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  const deadline = Date.now() + 1_200;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return;
    }
    await sleep(120);
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore
  }
}

async function acquireWorkerLock() {
  await hardenDir(PROFILE_ROOT);
  try {
    const raw = await readFile(WORKER_LOCK_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const existingPid = Number(parsed?.pid ?? 0);
    if (existingPid > 0 && existingPid !== process.pid && isPidAlive(existingPid)) {
      await logLine(`stale worker lock found; terminating pid=${existingPid}`);
      await terminatePid(existingPid);
    }
  } catch {
    // lock file missing/corrupt -> overwrite
  }

  const payload = JSON.stringify(
    {
      pid: process.pid,
      startedAt: nowIso(),
      profileRoot: PROFILE_ROOT,
    },
    null,
    2,
  );
  await writeFile(WORKER_LOCK_PATH, payload, { encoding: 'utf8', mode: 0o600 });
  await hardenFile(WORKER_LOCK_PATH);
  lockHeld = true;
}

async function releaseWorkerLock() {
  if (!lockHeld) {
    return;
  }
  try {
    const raw = await readFile(WORKER_LOCK_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Number(parsed?.pid ?? 0) === process.pid) {
      await unlink(WORKER_LOCK_PATH);
    }
  } catch {
    // ignore
  } finally {
    lockHeld = false;
  }
}

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

function resolveSystemChromeUserDataDir() {
  if (process.platform === 'darwin') {
    const candidate = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    return existsSync(candidate) ? candidate : '';
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    if (!localAppData) {
      return '';
    }
    const candidate = path.join(localAppData, 'Google', 'Chrome', 'User Data');
    return existsSync(candidate) ? candidate : '';
  }
  const linuxCandidates = [
    path.join(os.homedir(), '.config', 'google-chrome'),
    path.join(os.homedir(), '.config', 'chromium'),
  ];
  return linuxCandidates.find((candidate) => existsSync(candidate)) || '';
}

function isSystemProfileEnabled() {
  return USE_SYSTEM_CHROME_PROFILE && Boolean(SYSTEM_CHROME_PROFILE_DIR);
}

function providerProfileDir(provider) {
  if (isSystemProfileEnabled()) {
    return SYSTEM_CHROME_PROFILE_DIR;
  }
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
  const config = SESSION_PROVIDER_CONFIG[provider];
  if (!config) {
    return 'unknown';
  }
  const lower = sanitizedUrl.toLowerCase();
  if (config.loginSignals.some((signal) => lower.includes(signal))) {
    return 'login_required';
  }
  if (provider !== 'gemini') {
    return 'unknown';
  }
  if (config.activeSignals.some((signal) => lower.includes(signal))) {
    return 'active';
  }
  return 'unknown';
}

const GEMINI_PROMPT_INPUT_SELECTORS = PROVIDER_AUTOMATION_CONFIG.gemini.inputSelectors;

async function hasVisibleSelector(page, selectors) {
  for (const selector of selectors) {
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
  return false;
}

async function isGeminiPromptReady(page) {
  return hasVisibleSelector(page, GEMINI_PROMPT_INPUT_SELECTORS);
}

async function inferSessionStateWithPage(provider, page, contextOpen = true) {
  const safeUrl = contextOpen ? sanitizeUrlForUi(page?.url?.() ?? null) : null;
  const urlBased = inferSessionState(provider, safeUrl, contextOpen);
  if (!contextOpen || !page || page.isClosed()) {
    return { safeUrl, sessionState: urlBased };
  }

  try {
    const loginRequired = await isLikelyNotLoggedIn(provider, page);
    if (loginRequired) {
      return { safeUrl, sessionState: 'login_required' };
    }
    const promptReady = await hasVisibleSelector(page, providerAutomationConfig(provider).inputSelectors);
    if (promptReady) {
      return { safeUrl, sessionState: 'active' };
    }
    return { safeUrl, sessionState: urlBased };
  } catch {
    return { safeUrl, sessionState: urlBased };
  }
}

async function ensureProviderContext(provider) {
  if (!SESSION_PROVIDER_CONFIG[provider]) {
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
  if (!isSystemProfileEnabled()) {
    await hardenDir(profileDir);
  } else {
    for (const [otherProvider, wrapped] of state.providers.entries()) {
      if (otherProvider === provider) {
        continue;
      }
      try {
        await wrapped.context.close();
      } catch {
        // ignore
      }
      wrapped.contextClosed = true;
      state.providers.delete(otherProvider);
    }
  }

  const launchOptions = {
    headless: false,
    viewport: { width: 1380, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-dev-shm-usage', '--no-first-run'],
  };
  if (isSystemProfileEnabled()) {
    launchOptions.args.push('--profile-directory=Default');
  }

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

async function ensureProviderLandingPage(provider, page) {
  const config = SESSION_PROVIDER_CONFIG[provider];
  if (!config) {
    throw workerError('UNSUPPORTED_PROVIDER', `지원하지 않는 provider입니다: ${provider}`);
  }
  for (const url of config.homeUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      return;
    } catch {
      // try next
    }
  }
  throw workerError('NAVIGATION_FAILED', `${provider} 페이지로 이동하지 못했습니다.`);
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

function providerAutomationConfig(provider) {
  return PROVIDER_AUTOMATION_CONFIG[provider] ?? PROVIDER_AUTOMATION_CONFIG.gemini;
}

async function isLikelyNotLoggedIn(provider, page) {
  const config = SESSION_PROVIDER_CONFIG[provider];
  const loginSignals = [
    'input[type="email"]',
    'input[type="password"]',
    'button:has-text("Sign in")',
    'a:has-text("Sign in")',
    'button:has-text("Log in")',
    'a:has-text("Log in")',
    'button:has-text("로그인")',
    'a:has-text("로그인")',
    'text=/로그인|Sign in|Log in|계정 선택/i',
    'text=/지원되지 않는 명령줄 플래그|브라우저 또는 앱이 안전하지 않을 수 있습니다/i',
  ];
  if (await hasVisibleSelector(page, loginSignals)) {
    return true;
  }

  const urlLower = String(page.url() || '').toLowerCase();
  if (provider === 'gemini' && /accounts\.google\.com/.test(urlLower)) {
    return true;
  }
  if (config?.loginSignals?.some((signal) => urlLower.includes(String(signal).toLowerCase()))) {
    return true;
  }
  return false;
}

async function fillPromptAndSubmit(provider, page, prompt) {
  const automation = providerAutomationConfig(provider);
  const input = await waitForFirstVisible(page, automation.inputSelectors, 15_000);
  if (!input) {
    const notLoggedIn = await isLikelyNotLoggedIn(provider, page);
    if (notLoggedIn) {
      throw workerError('NOT_LOGGED_IN', `${provider.toUpperCase()} 로그인 상태를 확인할 수 없습니다. 먼저 로그인하세요.`);
    }
    throw workerError('INPUT_NOT_FOUND', `${provider.toUpperCase()} 입력창을 찾지 못했습니다.`);
  }

  notify('web/progress', {
    provider,
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
    provider,
    stage: 'prompt_filled',
    message: '프롬프트를 입력했습니다.',
  });

  for (const selector of automation.submitSelectors) {
    const button = page.locator(selector).first();
    try {
      if ((await button.count()) > 0 && (await button.isVisible())) {
        await button.click({ timeout: 5_000 });
        return;
      }
    } catch {
      // continue
    }
  }

  try {
    await page.keyboard.press('Enter');
  } catch (error) {
    throw workerError('SUBMIT_FAILED', `전송 동작 실패: ${String(error)}`);
  }
}

async function extractProviderResponseText(provider, page, prompt) {
  const automation = providerAutomationConfig(provider);
  const candidates = await page.evaluate((selectors) => {
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
    return rows.slice(-16);
  }, [
    ...automation.responseSelectors,
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="model"]',
    'main article',
    'main .markdown',
    'main .prose',
  ]);

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

async function waitForProviderResponse(provider, page, prompt, timeoutMs, runToken) {
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  let lastChangeAt = Date.now();

  while (Date.now() < deadline) {
    if (runToken.cancelled) {
      throw workerError('CANCELLED', '요청이 취소되었습니다.');
    }

    const text = await extractProviderResponseText(provider, page, prompt);
    if (text) {
      if (text !== lastText) {
        lastText = text;
        lastChangeAt = Date.now();
        notify('web/progress', {
          provider,
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

async function runProviderAutomation(provider, { prompt, timeoutMs }) {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const runToken = { cancelled: false, provider };
  state.activeRun = runToken;

  try {
    const wrapped = await ensureProviderContext(provider);
    const { page } = wrapped;

    notify('web/progress', {
      provider,
      stage: 'navigation',
      message: `${provider.toUpperCase()} 페이지를 준비합니다.`,
    });
    await ensureProviderLandingPage(provider, page);

    notify('web/progress', {
      provider,
      stage: 'input',
      message: '프롬프트 입력을 시작합니다.',
    });
    await fillPromptAndSubmit(provider, page, prompt);

    notify('web/progress', {
      provider,
      stage: 'await_response',
      message: '응답을 기다리는 중입니다.',
    });
    const text = await waitForProviderResponse(provider, page, prompt, timeoutMs, runToken);

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
  const wrapped = await ensureProviderContext(provider);
  await ensureProviderLandingPage(provider, wrapped.page);
  try {
    await wrapped.page.bringToFront();
  } catch {
    // ignore
  }

  const { safeUrl, sessionState } = await inferSessionStateWithPage(
    provider,
    wrapped.page,
    !wrapped.contextClosed,
  );
  notify('web/progress', {
    provider,
    stage: 'session_open',
    message: '로그인 세션 창을 열었습니다.',
  });
  return {
    ok: true,
    provider,
    url: safeUrl,
    sessionState,
  };
}

async function getHealthResult() {
  const providerStatuses = {};
  for (const [provider, wrapped] of state.providers.entries()) {
    const contextOpen = !wrapped.contextClosed;
    const { safeUrl, sessionState } = await inferSessionStateWithPage(
      provider,
      wrapped.page,
      contextOpen,
    );
    providerStatuses[provider] = {
      contextOpen,
      profileDir: wrapped.profileDir,
      url: safeUrl,
      sessionState,
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
  if (!isSystemProfileEnabled()) {
    await rm(profileDir, { recursive: true, force: true });
    await hardenDir(profileDir);
  }

  return { ok: true, provider, profileDir };
}

async function cancelProviderRun(provider) {
  if (!state.activeRun || state.activeRun.provider !== provider) {
    return { ok: true, cancelled: false };
  }

  state.activeRun.cancelled = true;
  return { ok: true, cancelled: true };
}

async function closeAllProviderContexts() {
  const providers = Array.from(state.providers.values());
  state.providers.clear();
  for (const wrapped of providers) {
    try {
      await wrapped.context.close();
    } catch {
      // ignore
    }
  }
}

async function gracefulShutdown(reason, exitCode = 0) {
  if (shutdownRequested) {
    return;
  }
  shutdownRequested = true;
  notify('web/worker/stopped', { reason, stoppedAt: nowIso() });
  await logLine(`web worker shutdown: ${reason}`);
  await closeAllProviderContexts();
  await releaseWorkerLock();
  process.exit(exitCode);
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

    if (!SESSION_PROVIDER_CONFIG[provider]) {
      respond(id, {
        ok: false,
        errorCode: 'UNSUPPORTED_PROVIDER',
        error: `지원하지 않는 provider입니다. provider=${provider}`,
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
      const result = await runProviderAutomation(provider, {
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
  await acquireWorkerLock();
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
    await gracefulShutdown('stdin closed', 0);
  });
}

process.on('uncaughtException', (error) => {
  state.lastError = `uncaughtException: ${String(error)}`;
  notify('web/worker/error', { message: state.lastError });
  void gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (error) => {
  state.lastError = `unhandledRejection: ${String(error)}`;
  notify('web/worker/error', { message: state.lastError });
  void gracefulShutdown('unhandledRejection', 1);
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT', 0);
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM', 0);
});

bootstrap().catch((error) => {
  const message = `bootstrap failed: ${String(error)}`;
  notify('web/worker/error', { message });
  void gracefulShutdown('bootstrap failed', 1);
});
