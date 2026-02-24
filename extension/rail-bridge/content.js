const DEFAULT_BRIDGE_URL = "http://127.0.0.1:38961";
const CLAIM_INTERVAL_MS = 1400;
const INPUT_WAIT_TIMEOUT_MS = 15000;
const RESPONSE_STABLE_MS = 1600;
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
  },
  gpt: {
    hostMatch: (host) => host === "chatgpt.com",
    inputSelectors: [
      "#prompt-textarea",
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="메시지" i]',
      'div[contenteditable="true"][id*="prompt" i]',
      "textarea",
    ],
    responseSelectors: [
      '[data-message-author-role="assistant"]',
      'article[data-testid*="conversation-turn"]',
      "main article",
      "main .markdown",
      "main .prose",
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
      "[data-testid*='message']",
      "main article",
      "main .markdown",
      "main .prose",
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
      "main article",
      "main .markdown",
      "main .prose",
    ],
  },
  claude: {
    hostMatch: (host) => host === "claude.ai",
    inputSelectors: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="메시지" i]',
      "textarea",
    ],
    responseSelectors: [
      "[data-testid*='message' i]",
      "main article",
      "main .markdown",
      "main .prose",
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
  return chrome.storage.session.get([URL_KEY, TOKEN_KEY]);
}

async function writeSessionBridgeConfig(values) {
  if (!chrome.storage.session) {
    return;
  }
  await chrome.storage.session.set(values);
}

async function loadBridgeConfig() {
  const [sessionStored, localStored] = await Promise.all([
    readSessionBridgeConfig(),
    chrome.storage.local.get([URL_KEY, TOKEN_KEY]),
  ]);
  const nextUrl = validateBridgeUrl(sessionStored[URL_KEY] ?? localStored[URL_KEY]);
  bridgeUrl = nextUrl || DEFAULT_BRIDGE_URL;

  const sessionToken = String(sessionStored[TOKEN_KEY] ?? "").trim();
  const localToken = String(localStored[TOKEN_KEY] ?? "").trim();
  bridgeToken = sessionToken || localToken;

  if (!sessionToken && localToken) {
    await writeSessionBridgeConfig({ [TOKEN_KEY]: localToken });
    await chrome.storage.local.remove([TOKEN_KEY]);
  }
}

function isElementVisible(element) {
  if (!element) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
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

function extractLastResponseText(selectors, prompt) {
  const rows = [];
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    for (const node of nodes) {
      const text = String(node.innerText ?? "").trim();
      if (!text || text.length < 24) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      rows.push({
        text,
        bottom: rect.bottom,
      });
    }
  }
  if (rows.length === 0) {
    return null;
  }
  rows.sort((a, b) => a.bottom - b.bottom);
  const promptTrimmed = String(prompt ?? "").trim();
  const filtered = rows
    .map((row) => row.text)
    .filter((text) => text !== promptTrimmed)
    .filter((text) => !promptTrimmed || !text.startsWith(promptTrimmed));
  if (filtered.length === 0) {
    return null;
  }
  return filtered[filtered.length - 1];
}

async function waitForResponse(provider, prompt, timeoutMs) {
  const selectors = PROVIDER_CONFIG[provider].responseSelectors;
  const deadline = Date.now() + timeoutMs;
  let last = "";
  let lastChangedAt = Date.now();
  while (Date.now() < deadline) {
    const current = extractLastResponseText(selectors, prompt);
    if (current) {
      if (current !== last) {
        last = current;
        lastChangedAt = Date.now();
      } else if (Date.now() - lastChangedAt >= RESPONSE_STABLE_MS) {
        return current;
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

async function postTaskResult(text) {
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
    },
    pageUrl: window.location.href,
  });
}

async function runTask(taskPayload) {
  const provider = detectProvider();
  if (!provider || provider !== taskPayload.provider) {
    throw new Error("provider mismatch");
  }
  const providerConfig = PROVIDER_CONFIG[provider];
  const timeoutMs = Math.max(5000, Number(taskPayload.timeoutMs ?? 90000) || 90000);
  activeTask = {
    id: taskPayload.id,
    provider,
    prompt: String(taskPayload.prompt ?? ""),
    timeoutMs,
  };

  try {
    await postTaskStage("claimed", "브라우저 탭이 작업을 수신했습니다.");
    const input = await waitForInput(providerConfig.inputSelectors, INPUT_WAIT_TIMEOUT_MS);
    if (!input) {
      throw new Error("INPUT_NOT_FOUND");
    }
    writePromptToInput(input, activeTask.prompt);
    await postTaskStage("prompt_filled", "프롬프트 자동 주입 완료");
    await postTaskStage("waiting_user_send", "사용자 전송 클릭 대기");
    const text = await waitForResponse(provider, activeTask.prompt, timeoutMs);
    if (!text) {
      throw new Error("TIMEOUT");
    }
    await postTaskStage("responding", "응답 안정화 확인");
    await postTaskResult(text);
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
  } catch {
    // noop: worker/app side handles status
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
      const text = extractLastResponseText(
        PROVIDER_CONFIG[activeTask.provider].responseSelectors,
        activeTask.prompt,
      );
      if (!text) {
        throw new Error("응답을 찾지 못했습니다.");
      }
      await postTaskResult(text);
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
