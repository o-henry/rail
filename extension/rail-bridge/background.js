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
