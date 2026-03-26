/**
 * Content script – injected into monday.com pages.
 *
 * Detects board pages and injects an "Inspector" button that opens
 * the Inspector side panel inline via Shadow DOM.
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { Inspector } from "../inspector/Inspector";
import { ErrorBoundary } from "../inspector/components/ErrorBoundary";
// @ts-ignore Vite ?inline import returns CSS as string
import inspectorCss from "../inspector/styles/inspector.css?inline";

const BUTTON_ID = "msi-inspector-btn";
const HOST_ID = "msi-inspector-host";

let root: Root | null = null;
let isOpen = false;

/**
 * Detect if the current URL is a monday.com board page.
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

// ── Shadow DOM container ─────────────────────────────────────────────

function getOrCreateHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;pointer-events:none;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = inspectorCss;
  shadow.appendChild(style);

  const appRoot = document.createElement("div");
  appRoot.id = "inspector-app";
  appRoot.className = "inspector-root";
  appRoot.style.cssText = "height:100%;";
  shadow.appendChild(appRoot);

  return host;
}

function removeHost(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  document.getElementById(HOST_ID)?.remove();
  isOpen = false;
  updateButtonState();
}

// ── Panel toggle ─────────────────────────────────────────────────────

/** Current board ID tracked reactively */
let currentBoardId = getBoardIdFromUrl();

function renderPanel(): void {
  if (!root) return;
  currentBoardId = getBoardIdFromUrl();
  root.render(
    React.createElement(
      ErrorBoundary,
      null,
      React.createElement(Inspector, {
        boardId: currentBoardId,
        onClose: () => togglePanel(),
        hidden: !isOpen,
      }),
    ),
  );
}

function togglePanel(): void {
  isOpen = !isOpen;
  updateButtonState();

  const host = getOrCreateHost();
  host.style.pointerEvents = "none";

  const shadow = host.shadowRoot!;
  const appEl = shadow.getElementById("inspector-app")!;

  if (isOpen && !root) {
    root = createRoot(appEl);
  }

  renderPanel();
}

function updateButtonState(): void {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) {
    btn.classList.toggle("msi-active", isOpen);
    btn.textContent = isOpen ? "✕ Inspector" : "🔍 Inspector";
  }
}

// ── Button injection ─────────────────────────────────────────────────

function injectButton(): void {
  if (document.getElementById(BUTTON_ID)) return;

  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.textContent = "🔍 Inspector";
  btn.title = "Monday.com Inspector — Browse, edit, and import items & subitems";

  btn.addEventListener("click", () => {
    const boardId = getBoardIdFromUrl();
    if (boardId) {
      chrome.storage.local.set({ current_board_id: boardId });
    }
    togglePanel();
  });

  const toolbar = document.querySelector(
    '[class*="board_header"] [class*="actions"], ' +
      '[class*="board-header-main"] [class*="right"], ' +
      '[data-testid="board-header-main"]',
  );

  if (toolbar) {
    toolbar.prepend(btn);
  } else {
    btn.classList.add("msi-floating");
    document.body.appendChild(btn);
  }
}

function removeButton(): void {
  document.getElementById(BUTTON_ID)?.remove();
  removeHost();
}

// ── SPA navigation observer ──────────────────────────────────────────

function observeNavigation(): void {
  let lastPath = window.location.pathname;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      if (isBoardPage()) {
        injectButton();
        // Re-render panel with new board ID if it's open
        const newBoardId = getBoardIdFromUrl();
        if (isOpen && newBoardId !== currentBoardId) {
          renderPanel();
        }
      } else {
        removeButton();
      }
    }
  };

  const debouncedCheck = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(check, 300);
  };

  const observer = new MutationObserver(debouncedCheck);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", check);
}

// ── Bootstrap ────────────────────────────────────────────────────────

function init(): void {
  if (isBoardPage()) {
    setTimeout(injectButton, 1500);
  }
  observeNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
