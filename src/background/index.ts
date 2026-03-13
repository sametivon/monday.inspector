/**
 * Background service worker (Manifest V3).
 *
 * Responsibilities:
 * - Listen for messages from content scripts and popup
 * - Open the side-panel / tab when the "Import Subitems" button is clicked
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OPEN_PANEL") {
    // Open the panel as a new tab (simplest MVP approach).
    // Future: migrate to chrome.sidePanel API once stable.
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/panel/index.html"),
    });
    sendResponse({ ok: true });
  }
  // Keep the message channel open for async responses
  return true;
});

// Optional: set up the extension icon badge
chrome.action.setBadgeBackgroundColor({ color: "#6161FF" });

export {};
