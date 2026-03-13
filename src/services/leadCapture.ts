import { LEAD_STORAGE_KEYS } from "../utils/brandConfig";

function getStorage(): typeof chrome.storage.local | null {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return null;
}

function getLocal(key: string): Promise<string> {
  const storage = getStorage();
  if (storage) {
    return new Promise((resolve) => {
      storage.get(key, (res) => resolve((res[key] as string) ?? ""));
    });
  }
  return Promise.resolve(localStorage.getItem(key) ?? "");
}

function setLocal(key: string, value: string): Promise<void> {
  const storage = getStorage();
  if (storage) {
    return new Promise((resolve) => {
      storage.set({ [key]: value }, resolve);
    });
  }
  localStorage.setItem(key, value);
  return Promise.resolve();
}

export async function getImportCount(): Promise<number> {
  const val = await getLocal(LEAD_STORAGE_KEYS.importCount);
  return parseInt(val, 10) || 0;
}

export async function incrementImportCount(): Promise<number> {
  const count = await getImportCount();
  const next = count + 1;
  await setLocal(LEAD_STORAGE_KEYS.importCount, String(next));
  return next;
}

export async function isReviewPromptDismissed(): Promise<boolean> {
  const val = await getLocal(LEAD_STORAGE_KEYS.reviewPromptDismissed);
  return val === "true";
}

export async function dismissReviewPrompt(): Promise<void> {
  await setLocal(LEAD_STORAGE_KEYS.reviewPromptDismissed, "true");
}

export async function isWelcomeDismissed(): Promise<boolean> {
  const val = await getLocal(LEAD_STORAGE_KEYS.welcomeDismissed);
  return val === "true";
}

export async function dismissWelcome(): Promise<void> {
  await setLocal(LEAD_STORAGE_KEYS.welcomeDismissed, "true");
}
