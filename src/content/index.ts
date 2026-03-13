/**
 * Content script – injected into monday.com pages.
 *
 * Detects board pages and injects an "Import Subitems" button into the
 * monday.com toolbar area.
 */

const BUTTON_ID = "msi-import-subitems-btn";

/**
 * Detect if the current URL is a monday.com board page.
 * Board URLs look like: https://[subdomain].monday.com/boards/[boardId]
 */
function isBoardPage(): boolean {
  return /\/boards\/\d+/.test(window.location.pathname);
}

/**
 * Extract board ID from URL.
 */
function getBoardIdFromUrl(): string | null {
  const match = window.location.pathname.match(/\/boards\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Create and inject the "Import Subitems" button.
 */
function injectButton(): void {
  if (document.getElementById(BUTTON_ID)) return; // already injected

  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.textContent = "📥 Import Subitems";
  btn.title = "Bulk import items & subitems from CSV/Excel — Monday.com Inspector";

  btn.addEventListener("click", () => {
    const boardId = getBoardIdFromUrl();
    // Store boardId so the panel can read it
    if (boardId) {
      chrome.storage.local.set({ current_board_id: boardId });
    }
    chrome.runtime.sendMessage({ type: "OPEN_PANEL" });
  });

  // Try to attach near monday.com's board header toolbar
  const toolbar = document.querySelector(
    '[class*="board_header"] [class*="actions"], ' +
    '[class*="board-header-main"] [class*="right"], ' +
    '[data-testid="board-header-main"]'
  );

  if (toolbar) {
    toolbar.prepend(btn);
  } else {
    // Fallback: floating button in bottom-right
    btn.classList.add("msi-floating");
    document.body.appendChild(btn);
  }
}

/**
 * Remove the button if we navigate away from a board.
 */
function removeButton(): void {
  document.getElementById(BUTTON_ID)?.remove();
}

/**
 * Watch for SPA navigation changes (monday.com is a single-page app).
 */
function observeNavigation(): void {
  let lastPath = window.location.pathname;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      if (isBoardPage()) {
        injectButton();
      } else {
        removeButton();
      }
    }
  };

  // Debounced check to avoid running on every DOM mutation
  const debouncedCheck = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(check, 300);
  };

  // MutationObserver catches SPA route changes that don't trigger popstate
  const observer = new MutationObserver(debouncedCheck);
  observer.observe(document.body, { childList: true, subtree: true });

  // Also listen for popstate (no debounce needed — fires once per navigation)
  window.addEventListener("popstate", check);
}

// ── Bootstrap ─────────────────────────────────────────────────────────

function init(): void {
  if (isBoardPage()) {
    // Slight delay to let monday.com render its toolbar
    setTimeout(injectButton, 1500);
  }
  observeNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
