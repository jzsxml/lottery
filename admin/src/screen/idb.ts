import type { ScreenState } from "./types";

const DB = "lottery-screen-v1";
const STORE = "state";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
  });
}

export async function saveScreenState(state: ScreenState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(state, "latest");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadScreenStateCache(): Promise<ScreenState | null> {
  const db = await openDb();
  const value = await new Promise<ScreenState | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("latest");
    req.onsuccess = () => resolve((req.result as ScreenState) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}