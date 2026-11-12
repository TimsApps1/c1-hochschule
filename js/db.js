// IndexedDB-Wrapper. Stores:
//   kv        {key, value}            Einstellungen, API-Key (nie synchronisiert), Sync-Metadaten
//   attempts  {id, t, day, modul, ...} Lern-Log (append-only) – XP, Streak und Statistik werden daraus berechnet
//   cards     {id, ...}               Spaced-Repetition-Stand je Wort/Redewendung
//   errors    {id, ...}               Fehlerprotokoll
//   texts     {id, ...}               Eigene Texte (Schreiben/Sprechen) inkl. Feedback
const DB_NAME = "c1-hochschule";
const DB_VERSION = 1;
export const STORES = ["kv", "attempts", "cards", "errors", "texts"];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv", { keyPath: "key" });
      for (const s of ["attempts", "cards", "errors", "texts"]) {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        try {
          result = fn(s);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result && "result" in result ? result.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const db = {
  get: (store, key) => tx(store, "readonly", (s) => s.get(key)),
  getAll: (store) => tx(store, "readonly", (s) => s.getAll()),
  put: (store, value) => tx(store, "readwrite", (s) => s.put(value)),
  bulkPut: (store, values) => tx(store, "readwrite", (s) => { for (const v of values) s.put(v); }),
  delete: (store, key) => tx(store, "readwrite", (s) => s.delete(key)),
  clear: (store) => tx(store, "readwrite", (s) => s.clear()),
  async kvGet(key, fallback = null) {
    const r = await this.get("kv", key);
    return r ? r.value : fallback;
  },
  kvSet(key, value) {
    return this.put("kv", { key, value });
  },
  kvDel(key) {
    return this.delete("kv", key);
  },
};

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  const h = [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
