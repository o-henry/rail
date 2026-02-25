const DEFAULT_BRIDGE_URL = "http://127.0.0.1:38961";
const CLAIM_INTERVAL_MS = 1400;
const INPUT_WAIT_TIMEOUT_MS = 15000;
const RESPONSE_STABLE_MS = 1600;
const BASELINE_CAPTURE_MS = 1400;
const BASELINE_CAPTURE_POLL_MS = 220;
const MIN_RESPONSE_AFTER_SUBMIT_MS = 2500;
const BASELINE_EXISTING_ELEMENT_MIN_GROWTH = 16;
const MAX_RESPONSE_TEXT_LENGTH = 12000;
const STRICT_ASSISTANT_ROLE_PROVIDERS = new Set(["gpt", "grok", "perplexity", "claude"]);
const RESPONSE_SETTLE_AFTER_GENERATION_MS = 1600;
const RESPONSE_SETTLE_WITHOUT_GENERATION_MS = 15000;
const URL_KEY = "railBridgeUrl";
const TOKEN_KEY = "railBridgeToken";

const PROVIDER_CONFIG = {
  gemini: {
    hostMatch: (host) => host === "gemini.google.com",
    inputSelectors: [
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="질문" i]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][aria-label*="prompt" i]',
      "rich-textarea div[contenteditable='true']",
      "textarea",
    ],
    responseSelectors: [
      '[data-message-author-role="model"]',
      "model-response",
      "main article",
      "main .markdown",
      "main .prose",
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[aria-label*="전송" i]',
      'button[type="submit"]',
    ],
    generationSelectors: [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="중지" i]',
      'button[data-testid*="stop" i]',
    ],
  },
  gpt: {
    hostMatch: (host) => host === "chatgpt.com" || host.endsWith(".chatgpt.com"),
    inputSelectors: [
      "#prompt-textarea",
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="메시지" i]',
      'div[contenteditable="true"][id*="prompt" i]',
      "textarea",
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      'article[data-testid*="assistant" i]',
      '[data-testid*="assistant" i]',
    ],
    submitSelectors: [
      'button[data-testid*="send" i]',
      'button[aria-label*="Send" i]',
      'button[type="submit"]',
    ],
    generationSelectors: [
      'button[data-testid*="stop" i]',
      'button[aria-label*="Stop" i]',
      'button[aria-label*="생성 중지" i]',
    ],
  },
  grok: {
    hostMatch: (host) => host === "grok.com",
    inputSelectors: [
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="질문" i]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    responseSelectors: [
      "[data-message-author-role='assistant']",
      "[data-testid*='assistant' i]",
      "[data-testid*='answer' i]",
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
      'button[type="submit"]',
    ],
    generationSelectors: [
      'button[data-testid*="stop" i]',
      'button[aria-label*="Stop" i]',
      'button[aria-label*="중지" i]',
    ],
  },
  perplexity: {
    hostMatch: (host) => host.endsWith("perplexity.ai"),
    inputSelectors: [
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="질문" i]',
      'div[contenteditable="true"]',
      "textarea",
    ],
    responseSelectors: [
      "[data-testid*='answer' i]",
      "[data-message-author-role='assistant']",
    ],
    submitSelectors: [
      'button[aria-label*="Submit" i]',
      'button[aria-label*="Send" i]',
      'button[type="submit"]',
    ],
    generationSelectors: [
      'button[aria-label*="Stop" i]',
      'button[data-testid*="stop" i]',
      '[data-testid*="stop" i]',
    ],
  },
  claude: {
    hostMatch: (host) => host === "claude.ai" || host.endsWith(".claude.ai"),
    inputSelectors: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="메시지" i]',
      "textarea",
    ],
    responseSelectors: [
      "[data-message-author-role='assistant']",
      "[data-testid*='assistant' i]",
      "[data-testid*='answer' i]",
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[type="submit"]',
    ],
    generationSelectors: [
      'button[aria-label*="Stop" i]',
      'button[data-testid*="stop" i]',
    ],
  },
};

function detectProvider() {
  const host = window.location.hostname.toLowerCase();
  for (const [provider, config] of Object.entries(PROVIDER_CONFIG)) {
    if (config.hostMatch(host)) {
      return provider;
    }
  }
  return null;
}

let bridgeUrl = DEFAULT_BRIDGE_URL;
let bridgeToken = "";
let claimInFlight = false;
let activeTask = null;
let lastBridgeErrorText = "";
let lastBridgeErrorAt = 0;

function normalizeBridgeUrl(raw) {
  const validated = validateBridgeUrl(raw);
  if (!validated) {
    return DEFAULT_BRIDGE_URL;
  }
  return validated;
}

function validateBridgeUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return DEFAULT_BRIDGE_URL;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:") {
      return null;
    }
    if (parsed.hostname !== "127.0.0.1") {
      return null;
    }
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    if (normalizedPath && normalizedPath !== "") {
      return null;
    }
    const port = parsed.port || "38961";
    return `http://127.0.0.1:${port}`;
  } catch {
    return null;
  }
}

async function readSessionBridgeConfig() {
  if (!chrome.storage.session) {
    return {};
  }
  try {
    return await chrome.storage.session.get([URL_KEY, TOKEN_KEY]);
  } catch {
    return {};
  }
}

async function writeSessionBridgeConfig(values) {
  if (!chrome.storage.session) {
    return;
  }
  try {
    await chrome.storage.session.set(values);
  } catch {
    // In some contexts storage.session is blocked; local storage fallback is enough.
  }
}

async function removeLocalBridgeToken() {
  try {
    await chrome.storage.local.remove(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function loadBridgeConfig() {
  const [sessionStored, localStored] = await Promise.all([
    readSessionBridgeConfig(),
    chrome.storage.local.get([URL_KEY, TOKEN_KEY]),
  ]);
  const nextUrl = validateBridgeUrl(sessionStored[URL_KEY] ?? localStored[URL_KEY]);
  bridgeUrl = nextUrl || DEFAULT_BRIDGE_URL;

  const sessionAvailable = Boolean(chrome.storage.session);
  const sessionToken = String(sessionStored[TOKEN_KEY] ?? "").trim();
  const localToken = String(localStored[TOKEN_KEY] ?? "").trim();
  bridgeToken = sessionToken || localToken;

  if (sessionAvailable && !sessionToken && localToken) {
    await writeSessionBridgeConfig({ [TOKEN_KEY]: localToken });
  }
  if (sessionAvailable && sessionToken && localToken) {
    await removeLocalBridgeToken();
  }
}

function isSendButtonCandidate(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (!isElementVisible(element)) {
    return false;
  }
  if ("disabled" in element && element.disabled) {
    return false;
  }
  if (element.getAttribute("aria-disabled") === "true") {
    return false;
  }
  return true;
}

function clickSendButton(provider) {
  const selectors = PROVIDER_CONFIG[provider]?.submitSelectors ?? [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!isSendButtonCandidate(element)) {
      continue;
    }
    element.click();
    return true;
  }
  return false;
}

function trySendWithEnter(inputElement) {
  if (!(inputElement instanceof HTMLElement)) {
    return false;
  }
  inputElement.focus();
  const enterDown = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
  });
  const enterUp = new KeyboardEvent("keyup", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
  });
  const downAccepted = inputElement.dispatchEvent(enterDown);
  inputElement.dispatchEvent(enterUp);
  return downAccepted;
}

function isElementVisible(element) {
  if (!element) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function hasVisibleSelector(selectors = []) {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element && isElementVisible(element)) {
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setNativeValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value",
  );
  descriptor?.set?.call(input, value);
}

function writePromptToInput(element, prompt) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.focus();
    setNativeValue(element, prompt);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  element.focus();
  if (element.isContentEditable) {
    element.textContent = "";
    const textNode = document.createTextNode(prompt);
    element.appendChild(textNode);
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: prompt, inputType: "insertText" }));
  }
}

async function waitForInput(selectors, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isElementVisible(element)) {
        return element;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return null;
}

function extractLastResponse(selectors, prompt, options = {}) {
  const rows = collectResponseRows(selectors, {
    provider: options.provider,
    requireAssistantRole: Boolean(options.requireAssistantRole),
  });
  if (rows.length === 0) {
    return null;
  }
  const minBottom = Number(options.minBottom ?? -Infinity);
  rows.sort((a, b) => a.bottom - b.bottom);
  const promptTrimmed = String(prompt ?? "").trim();
  const filtered = rows
    .filter((row) => Number.isFinite(minBottom) ? row.bottom > minBottom : true)
    .map((row) => ({
      text: row.text,
      bottom: row.bottom,
      element: row.element,
    }))
    .filter((row) => row.text !== promptTrimmed)
    .filter((row) => !promptTrimmed || !row.text.startsWith(promptTrimmed));
  if (filtered.length === 0) {
    return null;
  }
  return filtered[filtered.length - 1];
}

function extractLastResponseText(selectors, prompt, options = {}) {
  const row = extractLastResponse(selectors, prompt, options);
  return row?.text ?? null;
}

function hasAttributeFragment(element, fragments = []) {
  if (!(element instanceof Element)) {
    return false;
  }
  const haystack = [
    element.getAttribute("data-message-author-role"),
    element.getAttribute("data-testid"),
    element.getAttribute("aria-label"),
    element.getAttribute("id"),
    element.getAttribute("class"),
    element.getAttribute("role"),
    element.tagName,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return fragments.some((fragment) => haystack.includes(String(fragment).toLowerCase()));
}

function isLikelyUserMessageElement(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  if (element.closest('[data-message-author-role="user"]')) {
    return true;
  }
  if (
    hasAttributeFragment(element, [
      'data-message-author-role="user"',
      " author-user",
      "from-user",
      "user-message",
      "prompt",
      "query",
      "question",
    ])
  ) {
    return true;
  }
  const testId = String(element.getAttribute("data-testid") ?? "").toLowerCase();
  if (testId.includes("user") || testId.includes("query") || testId.includes("prompt")) {
    return true;
  }
  return false;
}

function isLikelyAssistantMessageElement(provider, element) {
  if (!(element instanceof Element)) {
    return false;
  }
  if (isLikelyUserMessageElement(element)) {
    return false;
  }
  if (element.closest('[data-message-author-role="assistant"], [data-message-author-role="model"]')) {
    return true;
  }
  const testId = String(element.getAttribute("data-testid") ?? "").toLowerCase();
  const role = String(element.getAttribute("data-message-author-role") ?? "").toLowerCase();
  const klass = String(element.getAttribute("class") ?? "").toLowerCase();
  if (role === "assistant" || role === "model") {
    return true;
  }
  if (
    testId.includes("assistant") ||
    testId.includes("answer") ||
    testId.includes("response") ||
    testId.includes("model")
  ) {
    return true;
  }
  if (
    klass.includes("assistant") ||
    klass.includes("answer") ||
    klass.includes("response") ||
    klass.includes("model")
  ) {
    return true;
  }

  if (provider === "perplexity") {
    return (
      element.matches("[data-testid*='answer' i]") ||
      Boolean(element.closest("[data-testid*='answer' i]"))
    );
  }
  if (provider === "gpt") {
    return (
      element.matches('[data-message-author-role="assistant"]') ||
      Boolean(element.closest('[data-message-author-role="assistant"]'))
    );
  }
  if (provider === "claude" || provider === "grok") {
    return (
      testId.includes("assistant") ||
      testId.includes("answer") ||
      testId.includes("response")
    );
  }
  if (provider === "gemini") {
    return (
      element.matches('[data-message-author-role="model"], model-response') ||
      Boolean(element.closest('[data-message-author-role="model"], model-response'))
    );
  }
  return false;
}

function isLikelyConversationContainer(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  const conversationChildren = element.querySelectorAll(
    "[data-message-author-role], [data-testid*='message' i], [data-testid*='answer' i]",
  ).length;
  return conversationChildren >= 4;
}

function collectResponseRows(selectors, options = {}) {
  const provider = String(options.provider ?? "").trim().toLowerCase();
  const requireAssistantRole = Boolean(options.requireAssistantRole);
  const rows = [];
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    for (const node of nodes) {
      if (!(node instanceof Element)) {
        continue;
      }
      if (!isElementVisible(node)) {
        continue;
      }
      if (isLikelyUserMessageElement(node)) {
        continue;
      }
      if (requireAssistantRole && !isLikelyAssistantMessageElement(provider, node)) {
        continue;
      }
      if (isLikelyConversationContainer(node) && !isLikelyAssistantMessageElement(provider, node)) {
        continue;
      }
      const text = String(node.innerText ?? "").trim();
      if (!text || text.length < 24 || text.length > MAX_RESPONSE_TEXT_LENGTH) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      rows.push({
        text,
        bottom: rect.bottom,
        element: node,
        selector,
      });
    }
  }
  rows.sort((a, b) => a.bottom - b.bottom);
  return rows;
}

async function captureBaselineSnapshot(selectors, durationMs = BASELINE_CAPTURE_MS, options = {}) {
  const normalizedSet = new Set();
  const baselineElementText = new WeakMap();
  const deadline = Date.now() + Math.max(300, Number(durationMs) || BASELINE_CAPTURE_MS);
  let baselineBottom = -Infinity;
  let baselineText = "";

  while (Date.now() < deadline) {
    const rows = collectResponseRows(selectors, options);
    for (const row of rows) {
      const normalized = normalizeComparableText(row.text);
      if (!normalized) {
        continue;
      }
      normalizedSet.add(normalized);
      baselineElementText.set(row.element, normalized);
      if (row.bottom > baselineBottom) {
        baselineBottom = row.bottom;
        baselineText = row.text;
      }
    }
    await sleep(BASELINE_CAPTURE_POLL_MS);
  }

  return {
    baselineSet: normalizedSet,
    baselineElementText,
    baselineBottom,
    baselineText,
  };
}

function markNodeAndAncestors(map, node, timestamp) {
  if (!node) {
    return;
  }
  let element = node instanceof Element ? node : node.parentElement;
  let depth = 0;
  while (element && depth < 10) {
    map.set(element, timestamp);
    element = element.parentElement;
    depth += 1;
  }
}

function createMutationTracker(root) {
  const map = new WeakMap();
  const observer = new MutationObserver((mutations) => {
    const stamp = Date.now();
    for (const mutation of mutations) {
      markNodeAndAncestors(map, mutation.target, stamp);
      if (mutation.type === "childList") {
        for (const row of mutation.addedNodes) {
          markNodeAndAncestors(map, row, stamp);
        }
      }
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  return {
    getMutationAt(element) {
      if (!(element instanceof Element)) {
        return 0;
      }
      return Number(map.get(element) ?? 0) || 0;
    },
    stop() {
      observer.disconnect();
    },
  };
}

function collectResponseBaselineSet(selectors) {
  const baselineSet = new Set();
  const rows = collectResponseRows(selectors);
  for (const row of rows) {
    const normalized = normalizeComparableText(row.text);
    if (!normalized) {
      continue;
    }
    baselineSet.add(normalized);
  }
  return baselineSet;
}

function normalizeComparableText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectPromptNeedles(promptText) {
  const normalized = normalizeComparableText(promptText);
  if (!normalized) {
    return [];
  }
  const len = normalized.length;
  const needleLen = len >= 512 ? 96 : len >= 220 ? 72 : 48;
  if (len <= needleLen) {
    return [normalized];
  }
  const offsets = [
    0,
    Math.max(0, Math.floor(len * 0.2) - Math.floor(needleLen / 2)),
    Math.max(0, Math.floor(len * 0.45) - Math.floor(needleLen / 2)),
    Math.max(0, Math.floor(len * 0.7) - Math.floor(needleLen / 2)),
    Math.max(0, len - needleLen),
  ];
  const unique = new Set();
  for (const start of offsets) {
    const needle = normalized.slice(start, start + needleLen).trim();
    if (needle.length >= 32) {
      unique.add(needle);
    }
  }
  return Array.from(unique);
}

function isPromptEcho(text, prompt) {
  const promptText = normalizeComparableText(prompt);
  if (!promptText) {
    return false;
  }
  const candidate = normalizeComparableText(text);
  if (
    /^나의 말[:：]/i.test(candidate) ||
    /^you said[:：]/i.test(candidate) ||
    /^your message[:：]/i.test(candidate) ||
    /^user[:：]/i.test(candidate)
  ) {
    return true;
  }
  if (candidate === promptText || candidate.startsWith(promptText)) {
    return true;
  }
  const start = promptText.slice(0, 120);
  const end = promptText.slice(-120);
  if (start.length >= 40 && candidate.includes(start)) {
    return true;
  }
  if (end.length >= 40 && candidate.includes(end)) {
    return true;
  }
  const needles = collectPromptNeedles(promptText);
  if (needles.length > 0) {
    let hitCount = 0;
    for (const needle of needles) {
      if (candidate.includes(needle)) {
        hitCount += 1;
      }
      if (hitCount >= 2) {
        return true;
      }
    }
  }
  return false;
}

async function waitForResponse(provider, prompt, timeoutMs, options = {}) {
  const selectors = PROVIDER_CONFIG[provider].responseSelectors;
  const deadline = Date.now() + timeoutMs;
  const baseline = normalizeComparableText(options.baselineText ?? "");
  const baselineSet =
    options.baselineSet instanceof Set ? options.baselineSet : new Set();
  const minBottom = Number(options.baselineBottom ?? -Infinity);
  const mutationCutoffMs = Number(options.requireMutationAfter ?? 0);
  const getMutationAt = typeof options.getMutationAt === "function" ? options.getMutationAt : null;
  const getBaselineElementText =
    typeof options.getBaselineElementText === "function" ? options.getBaselineElementText : null;
  const acceptAfterMs = Number(options.acceptAfterMs ?? 0);
  const generationSelectors = PROVIDER_CONFIG[provider]?.generationSelectors ?? [];
  const strictEvidence = STRICT_ASSISTANT_ROLE_PROVIDERS.has(provider);
  let last = "";
  let lastChangedAt = Date.now();
  let responseSeenAt = 0;
  let generationSeenAt = 0;
  let changeCount = 0;
  while (Date.now() < deadline) {
    if (acceptAfterMs > 0 && Date.now() < acceptAfterMs) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      continue;
    }
    const isGenerating = hasVisibleSelector(generationSelectors);
    if (isGenerating) {
      generationSeenAt = Date.now();
    }
    const responseRow = extractLastResponse(selectors, prompt, {
      minBottom,
      provider,
      requireAssistantRole: STRICT_ASSISTANT_ROLE_PROVIDERS.has(provider),
    });
    if (responseRow?.text) {
      const current = responseRow.text;
      const normalized = normalizeComparableText(current);
      if (!normalized) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      if (baseline && normalized === baseline) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      if (baselineSet.size > 0 && baselineSet.has(normalized)) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      if (getBaselineElementText) {
        const baseOnSameElement = normalizeComparableText(getBaselineElementText(responseRow.element) ?? "");
        if (baseOnSameElement) {
          if (normalized === baseOnSameElement) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
          const growth = normalized.length - baseOnSameElement.length;
          if (growth < BASELINE_EXISTING_ELEMENT_MIN_GROWTH) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
        }
      }
      if (isPromptEcho(normalized, prompt)) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      if (mutationCutoffMs > 0 && getMutationAt) {
        const mutationAt = getMutationAt(responseRow.element);
        if (!mutationAt || mutationAt < mutationCutoffMs) {
          await new Promise((resolve) => setTimeout(resolve, 450));
          continue;
        }
      }
      if (!responseSeenAt) {
        responseSeenAt = Date.now();
      }
      if (current !== last) {
        last = current;
        lastChangedAt = Date.now();
        changeCount += 1;
      } else if (Date.now() - lastChangedAt >= RESPONSE_STABLE_MS) {
        if (isGenerating) {
          await new Promise((resolve) => setTimeout(resolve, 450));
          continue;
        }
        const now = Date.now();
        if (generationSeenAt > 0) {
          if (now - generationSeenAt < RESPONSE_SETTLE_AFTER_GENERATION_MS) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
        } else {
          if (responseSeenAt > 0 && now - responseSeenAt < RESPONSE_SETTLE_WITHOUT_GENERATION_MS) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
          if (strictEvidence && changeCount < 2) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
        }
        return responseRow;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  return null;
}

async function callBridge(path, body, method = "POST") {
  if (!validateBridgeUrl(bridgeUrl)) {
    throw new Error("웹 연결 URL은 http://127.0.0.1:<port>만 허용됩니다.");
  }
  const response = await fetch(`${bridgeUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bridgeToken}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const reason = payload?.error || `HTTP ${response.status}`;
    throw new Error(reason);
  }
  return payload;
}

async function postTaskStage(stage, detail) {
  if (!activeTask) {
    return;
  }
  await callBridge(`/v1/task/${encodeURIComponent(activeTask.id)}/stage`, {
    stage,
    detail,
    pageUrl: window.location.href,
  });
}

async function postTaskError(code, message) {
  if (!activeTask) {
    return;
  }
  await callBridge(`/v1/task/${encodeURIComponent(activeTask.id)}/error`, {
    code,
    message,
    pageUrl: window.location.href,
  });
}

async function postTaskResult(text, evidence = null) {
  if (!activeTask) {
    return;
  }
  await callBridge(`/v1/task/${encodeURIComponent(activeTask.id)}/result`, {
    text,
    raw: null,
    meta: {
      provider: activeTask.provider,
      url: window.location.href,
      capturedAt: new Date().toISOString(),
      extractionStrategy: "extension-dom-latest-stable",
      extractionEvidence: evidence,
    },
    pageUrl: window.location.href,
  });
}

async function postBridgeEvent(code, message, provider) {
  await callBridge("/v1/bridge/event", {
    provider,
    level: "error",
    code,
    message,
    pageUrl: window.location.href,
  });
}

async function runTask(taskPayload) {
  const provider = detectProvider();
  if (!provider || provider !== taskPayload.provider) {
    throw new Error("provider mismatch");
  }
  const providerConfig = PROVIDER_CONFIG[provider];
  const timeoutMs = Math.max(5000, Number(taskPayload.timeoutMs ?? 180000) || 180000);
  let mutationTracker = null;
  activeTask = {
    id: taskPayload.id,
    provider,
    prompt: String(taskPayload.prompt ?? ""),
    timeoutMs,
    baselineText: "",
    baselineSet: new Set(),
    baselineElementText: new WeakMap(),
    baselineBottom: -Infinity,
    mutationCutoffMs: 0,
    submitAtMs: 0,
  };

  try {
    await postTaskStage("claimed", "브라우저 탭이 작업을 수신했습니다.");
    const input = await waitForInput(providerConfig.inputSelectors, INPUT_WAIT_TIMEOUT_MS);
    if (!input) {
      throw new Error("INPUT_NOT_FOUND");
    }

    const baselineSnapshot = await captureBaselineSnapshot(
      providerConfig.responseSelectors,
      BASELINE_CAPTURE_MS,
      {
        provider,
        requireAssistantRole: STRICT_ASSISTANT_ROLE_PROVIDERS.has(provider),
      },
    );
    activeTask.baselineText = baselineSnapshot.baselineText;
    activeTask.baselineSet = baselineSnapshot.baselineSet;
    activeTask.baselineElementText = baselineSnapshot.baselineElementText;
    activeTask.baselineBottom = baselineSnapshot.baselineBottom;

    mutationTracker = createMutationTracker(document.body);
    activeTask.mutationCutoffMs = Date.now();
    activeTask.mutationTracker = mutationTracker;

    writePromptToInput(input, activeTask.prompt);
    await postTaskStage("prompt_filled", "프롬프트 자동 주입 완료");
    const autoSent = clickSendButton(provider) || trySendWithEnter(input);
    activeTask.submitAtMs = Date.now();
    if (autoSent) {
      await postTaskStage("responding", "전송 자동 클릭 완료");
    } else {
      await postTaskStage("waiting_user_send", "자동 전송 실패: 사용자 전송 클릭 대기");
    }
    const responseRow = await waitForResponse(provider, activeTask.prompt, timeoutMs, {
      baselineText: activeTask.baselineText,
      baselineSet: activeTask.baselineSet,
      baselineBottom: activeTask.baselineBottom,
      requireMutationAfter: activeTask.mutationCutoffMs,
      getBaselineElementText: (element) =>
        activeTask.baselineElementText?.get ? activeTask.baselineElementText.get(element) : "",
      acceptAfterMs: Number(activeTask.submitAtMs ?? 0) + MIN_RESPONSE_AFTER_SUBMIT_MS,
      getMutationAt: mutationTracker ? (element) => mutationTracker.getMutationAt(element) : null,
    });
    if (!responseRow?.text) {
      throw new Error("TIMEOUT");
    }
    await postTaskStage("responding", "응답 안정화 확인");
    await postTaskResult(responseRow.text, {
      selector: responseRow.selector ?? null,
      bottom: responseRow.bottom ?? null,
      length: responseRow.text.length,
    });
  } catch (error) {
    const message = String(error);
    const code =
      message.includes("INPUT_NOT_FOUND")
        ? "INPUT_NOT_FOUND"
        : message.includes("TIMEOUT")
          ? "TIMEOUT"
          : "BRIDGE_CAPTURE_FAILED";
    await postTaskError(code, message);
  } finally {
    if (mutationTracker) {
      mutationTracker.stop();
    }
    activeTask = null;
  }
}

async function tick() {
  const provider = detectProvider();
  if (!provider || !bridgeToken || activeTask || claimInFlight) {
    return;
  }
  claimInFlight = true;
  try {
    const payload = await callBridge("/v1/task/claim", {
      provider,
      pageUrl: window.location.href,
    });
    if (!payload?.task) {
      return;
    }
    await runTask(payload.task);
  } catch (error) {
    const message = String(error ?? "unknown bridge error");
    const now = Date.now();
    if (message !== lastBridgeErrorText || now - lastBridgeErrorAt > 5_000) {
      lastBridgeErrorText = message;
      lastBridgeErrorAt = now;
      try {
        await postBridgeEvent("CLAIM_FAILED", message, provider);
      } catch {
        // ignore secondary error
      }
    }
  } finally {
    claimInFlight = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RAIL_FORCE_SEND_LATEST") {
    return undefined;
  }
  void (async () => {
    try {
      if (!activeTask) {
        sendResponse({ ok: false, error: "활성 작업이 없습니다." });
        return;
      }
      const responseRow = extractLastResponse(
        PROVIDER_CONFIG[activeTask.provider].responseSelectors,
        activeTask.prompt,
        {
          minBottom: Number(activeTask.baselineBottom ?? -Infinity),
          provider: activeTask.provider,
          requireAssistantRole: STRICT_ASSISTANT_ROLE_PROVIDERS.has(activeTask.provider),
        },
      );
      const text = responseRow?.text ?? "";
      if (!text) {
        throw new Error("응답을 찾지 못했습니다.");
      }
      const baseline = normalizeComparableText(activeTask.baselineText ?? "");
      const baselineSet =
        activeTask.baselineSet instanceof Set ? activeTask.baselineSet : new Set();
      const normalized = normalizeComparableText(text);
      const mutationAt =
        activeTask.mutationTracker && typeof activeTask.mutationTracker.getMutationAt === "function"
          ? Number(activeTask.mutationTracker.getMutationAt(responseRow?.element))
          : 0;
      const baselineOnSameElement =
        activeTask.baselineElementText?.get && responseRow?.element
          ? normalizeComparableText(activeTask.baselineElementText.get(responseRow.element) ?? "")
          : "";
      const baselineElementGrowth = baselineOnSameElement ? normalized.length - baselineOnSameElement.length : 0;
      if (
        !normalized ||
        (baseline && normalized === baseline) ||
        (baselineSet.size > 0 && baselineSet.has(normalized)) ||
        (Number(activeTask.submitAtMs ?? 0) > 0 &&
          Date.now() < Number(activeTask.submitAtMs) + MIN_RESPONSE_AFTER_SUBMIT_MS) ||
        (baselineOnSameElement &&
          (normalized === baselineOnSameElement || baselineElementGrowth < BASELINE_EXISTING_ELEMENT_MIN_GROWTH)) ||
        (typeof activeTask.mutationCutoffMs === "number" &&
          activeTask.mutationCutoffMs > 0 &&
          mutationAt < activeTask.mutationCutoffMs) ||
        isPromptEcho(normalized, activeTask.prompt)
      ) {
        throw new Error("새로운 모델 응답이 확인되지 않았습니다.");
      }
      await postTaskResult(text, {
        selector: responseRow?.selector ?? null,
        bottom: responseRow?.bottom ?? null,
        length: normalized.length,
        forced: true,
      });
      activeTask = null;
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" && areaName !== "session") {
    return;
  }
  if (URL_KEY in changes || TOKEN_KEY in changes) {
    void loadBridgeConfig();
  }
});

void loadBridgeConfig().finally(() => {
  window.setInterval(() => {
    void tick();
  }, CLAIM_INTERVAL_MS);
});
