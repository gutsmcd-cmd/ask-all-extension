// Ask All (PC) - service worker.
// Its only job: open (or focus) the Hub page when the toolbar button is clicked.
// All the real work runs in the Hub page itself, so nothing polls in the background.

chrome.action.onClicked.addListener(async () => {
  const hubUrl = chrome.runtime.getURL('hub.html');
  const tabs = await chrome.tabs.query({ url: hubUrl });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: hubUrl });
  }
});
