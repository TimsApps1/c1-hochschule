// Dropbox-Sync: eine JSON-Datei im App-Ordner
// herunterladen, zusammenführen, hochladen. Außerdem manueller Export/Import als Datei.
// Der API-Key und der Kostenzähler werden NICHT synchronisiert.
import { db } from "./db.js";
import { dropbox } from "./dropbox.js";
import { store } from "./store.js";
import { CONFIG } from "./config.js";

export const sync = {
  running: false,
  lastSync: null,
  lastError: null,
  listeners: new Set(),

  async init() {
    this.lastSync = await db.kvGet("sync.last");
    this.lastError = await db.kvGet("sync.error");
  },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) try { fn(this); } catch (_) {} },

  async canSync() {
    return dropbox.isConfigured() && (await dropbox.isConnected());
  },

  async run() {
    if (this.running) return { changed: false, skipped: true };
    if (!(await this.canSync())) return { changed: false, skipped: true };
    if (!navigator.onLine) { this.lastError = "Offline"; this.emit(); return { changed: false, error: "offline" }; }
    this.running = true;
    this.emit();
    try {
      const text = await dropbox.download(CONFIG.DROPBOX_FILE);
      let changed = false;
      if (text) changed = await store.mergeIn(JSON.parse(text));
      if (store.dirty || changed || !text) {
        await store.setDirty(false);
        try {
          await dropbox.upload(CONFIG.DROPBOX_FILE, JSON.stringify(store.exportAll()));
        } catch (e) {
          await store.setDirty(true);
          throw e;
        }
      }
      this.lastSync = Date.now();
      this.lastError = null;
      await db.kvSet("sync.last", this.lastSync);
      await db.kvDel("sync.error");
      return { changed };
    } catch (e) {
      console.error("Sync-Fehler", e);
      this.lastError = e.message || String(e);
      await db.kvSet("sync.error", this.lastError);
      return { changed: false, error: this.lastError };
    } finally {
      this.running = false;
      this.emit();
    }
  },

  async exportToFile() {
    const data = JSON.stringify(store.exportAll(), null, 1);
    const blob = new Blob([data], { type: "application/json" });
    const name = `c1-lernstand-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "C1-Lernstand" });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  },

  async importFromFile(file) {
    return store.mergeIn(JSON.parse(await file.text()));
  },
};
