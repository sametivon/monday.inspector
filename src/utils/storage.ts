import { STORAGE_KEY_TOKEN } from "./constants";
import type { ExtensionSettings } from "./types";

/**
 * Retrieve the API token from chrome.storage.local (falls back to
 * localStorage for dev-mode panel served by Vite).
 */
export async function getApiToken(): Promise<string> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY_TOKEN, (result) => {
        resolve((result[STORAGE_KEY_TOKEN] as string) ?? "");
      });
    });
  }
  // Dev fallback
  return localStorage.getItem(STORAGE_KEY_TOKEN) ?? "";
}

/**
 * Persist the API token.
 */
export async function setApiToken(token: string): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token }, resolve);
    });
  }
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

/**
 * Load full settings (extensible for future fields).
 */
export async function getSettings(): Promise<ExtensionSettings> {
  const apiToken = await getApiToken();
  return { apiToken };
}
