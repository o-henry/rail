const DEFAULT_URL = "http://127.0.0.1:38961";
const URL_KEY = "railBridgeUrl";
const TOKEN_KEY = "railBridgeToken";

const urlInput = document.querySelector("#bridge-url");
const tokenInput = document.querySelector("#bridge-token");
const statusEl = document.querySelector("#status");
const saveButton = document.querySelector("#save");
const testButton = document.querySelector("#test");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#d92f2f" : "#2e3947";
}

function normalizeUrl(raw) {
  const validated = validateBridgeUrl(raw);
  if (!validated) {
    return DEFAULT_URL;
  }
  return validated;
}

function validateBridgeUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return DEFAULT_URL;
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

async function readSessionConfig() {
  if (!chrome.storage.session) {
    return {};
  }
  return chrome.storage.session.get([URL_KEY, TOKEN_KEY]);
}

async function writeSessionConfig(values) {
  if (!chrome.storage.session) {
    return;
  }
  await chrome.storage.session.set(values);
}

async function removeLocalToken() {
  await chrome.storage.local.remove([TOKEN_KEY]);
}

async function loadConfig() {
  const [sessionStored, localStored] = await Promise.all([
    readSessionConfig(),
    chrome.storage.local.get([URL_KEY, TOKEN_KEY]),
  ]);
  const nextUrl = normalizeUrl(sessionStored[URL_KEY] ?? localStored[URL_KEY]);
  const sessionToken = String(sessionStored[TOKEN_KEY] ?? "").trim();
  const localToken = String(localStored[TOKEN_KEY] ?? "").trim();
  const nextToken = sessionToken || localToken;

  if (!sessionToken && localToken) {
    await writeSessionConfig({ [TOKEN_KEY]: localToken });
    await removeLocalToken();
  }

  urlInput.value = nextUrl;
  tokenInput.value = nextToken;
}

async function saveConfig() {
  const nextUrl = validateBridgeUrl(urlInput.value);
  if (!nextUrl) {
    setStatus("웹 연결 URL은 http://127.0.0.1:<port> 형식만 허용됩니다.", true);
    return;
  }
  const nextToken = String(tokenInput.value ?? "").trim();
  if (!nextToken) {
    setStatus("토큰을 입력하세요.", true);
    return;
  }
  await Promise.all([
    chrome.storage.local.set({ [URL_KEY]: nextUrl }),
    writeSessionConfig({ [URL_KEY]: nextUrl, [TOKEN_KEY]: nextToken }),
    removeLocalToken(),
  ]);
  setStatus("저장 완료 (토큰은 브라우저 세션에만 저장됨)");
}

async function testConnection() {
  const baseUrl = validateBridgeUrl(urlInput.value);
  if (!baseUrl) {
    setStatus("웹 연결 URL은 http://127.0.0.1:<port> 형식만 허용됩니다.", true);
    return;
  }
  const token = String(tokenInput.value ?? "").trim();
  if (!token) {
    setStatus("토큰을 입력하세요.", true);
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/v1/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.ok !== true) {
      throw new Error("invalid payload");
    }
    setStatus("연결 성공");
  } catch (error) {
    setStatus(`연결 실패: ${String(error)}`, true);
  }
}

saveButton.addEventListener("click", () => {
  void saveConfig();
});

testButton.addEventListener("click", () => {
  void testConnection();
});

void loadConfig();
