async function enableSessionStorageForContentScripts() {
  if (!chrome.storage?.session?.setAccessLevel) {
    return;
  }
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  } catch {
    // ignore: extension keeps working with local storage fallback
  }
}

void enableSessionStorageForContentScripts();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-latest-response") {
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "RAIL_FORCE_SEND_LATEST" });
});
