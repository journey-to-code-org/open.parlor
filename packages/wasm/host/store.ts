// The files a game writes (its settings, saved games), kept in the browser between visits.
// One IndexedDB store for every game, each game's files under its own name: "shooter/.default.cfg".
// Every call gives up quietly if the browser has no storage to offer (a private window, say): the
// game still plays, and forgets.

const DATABASE = "open-wasm";
const STORE = "files";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(request: IDBRequest | IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    if (request instanceof IDBTransaction) request.oncomplete = () => resolve();
    else request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export interface Store {
  /** Everything this game has kept, by path. */
  load(): Promise<Map<string, Uint8Array>>;
  save(path: string, bytes: Uint8Array): void;
  remove(path: string): void;
}

export function store(game: string): Store {
  const prefix = `${game}/`;
  const change = (apply: (files: IDBObjectStore) => void) =>
    void database()
      .then((db) => {
        const transaction = db.transaction(STORE, "readwrite");
        apply(transaction.objectStore(STORE));
        return done(transaction);
      })
      .catch(() => {});
  return {
    async load() {
      const kept = new Map<string, Uint8Array>();
      try {
        const db = await database();
        const files = db.transaction(STORE).objectStore(STORE);
        const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
        await new Promise<void>((resolve, reject) => {
          const cursor = files.openCursor(range);
          cursor.onerror = () => reject(cursor.error);
          cursor.onsuccess = () => {
            const at = cursor.result;
            if (!at) return resolve();
            kept.set(String(at.key).slice(prefix.length), new Uint8Array(at.value as ArrayBuffer));
            at.continue();
          };
        });
      } catch {}
      return kept;
    },
    save: (path, bytes) => change((files) => files.put(bytes.slice().buffer, prefix + path)),
    remove: (path) => change((files) => files.delete(prefix + path)),
  };
}
