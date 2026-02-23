const DEFAULT_URL = "http://127.0.0.1:38961";

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
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return DEFAULT_URL;
  }
  return trimmed.replace(/\/+$/, "");
}

async function loadConfig() {
  const stored = await chrome.storage.local.get(["railBridgeUrl", "railBridgeToken"]);
  urlInput.value = normalizeUrl(stored.railBridgeUrl);
  tokenInput.value = String(stored.railBridgeToken ?? "");
}

async function saveConfig() {
  const nextUrl = normalizeUrl(urlInput.value);
  const nextToken = String(tokenInput.value ?? "").trim();
  await chrome.storage.local.set({
    railBridgeUrl: nextUrl,
    railBridgeToken: nextToken,
  });
  setStatus("저장 완료");
}

async function testConnection() {
  const baseUrl = normalizeUrl(urlInput.value);
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
