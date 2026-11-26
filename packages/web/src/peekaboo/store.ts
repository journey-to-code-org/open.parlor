// Peekaboo's things kept in this browser's IndexedDB: the grown-ups' recordings and the photo album.
// Small things (settings, the family, their own pictures, the words diary) are in localStorage.
const DB = "peekaboo";
const STORES = ["voices", "album"] as const;
export type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((yes, no) => {
    if (typeof indexedDB === "undefined") return no(new Error("No storage here"));
    const open = indexedDB.open(DB, 2);
    open.onupgradeneeded = () => {
      for (const name of STORES) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
    };
    open.onsuccess = () => yes(open.result);
    open.onerror = () => no(open.error);
  });
  opening.catch(() => (opening = null));
  return opening;
}

export async function inStore<T>(name: StoreName, mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((yes, no) => {
    const req = act(d.transaction(name, mode).objectStore(name));
    req.onsuccess = () => yes(req.result);
    req.onerror = () => no(req.error);
  });
}

/** Small things kept in localStorage, read safely. */
export function loadJson<T>(key: string, tidy: (raw: unknown) => T): T {
  try {
    return tidy(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return tidy(null);
  }
}
export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // full, or private browsing
  }
}
