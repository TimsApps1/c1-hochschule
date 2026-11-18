// Zentraler Lernstand. Alles liegt in IndexedDB und wird beim Start in den Speicher geladen.
// Grundprinzip: Der Versuchs-Log (attempts) ist append-only. XP, Streak, Abzeichen und Statistik
// werden daraus berechnet – dadurch ist der Dropbox-Abgleich zwischen Geräten konfliktfrei
// (Vereinigung nach id, bei Karten/Fehlern/Texten gewinnt der neuere updatedAt).
import { db, uuid } from "./db.js";

export const DEFAULT_SETTINGS = {
  dailyGoalXp: 80,
  weeklyGoalXp: 450,
  newWordsPerDay: 15,
  newIdiomsPerDay: 6,
  ttsRate: 1.0,
  ttsVoiceA: "",
  ttsVoiceB: "",
  ttsVoiceC: "",
  aiModel: "claude-sonnet-5-5",
  aiDailyLimitUsd: 1.0,
  aiEffort: "medium",
  theme: "auto",
  // Profil (nur auf dem Gerät/in der eigenen Dropbox, nicht im Code): Name für die Begrüßung, Hintergrund für die KI
  name: "",
  profil: "",
  updatedAt: 0,
};

export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const listeners = new Set();

export const store = {
  attempts: [],
  cards: new Map(),
  errors: new Map(),
  texts: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  dirty: false,
  deleted: new Set(), // IDs gelöschter Versuche (werden mitsynchronisiert)

  async init() {
    const [attempts, cards, errors, texts, settings, dirty] = await Promise.all([
      db.getAll("attempts"),
      db.getAll("cards"),
      db.getAll("errors"),
      db.getAll("texts"),
      db.kvGet("settings"),
      db.kvGet("dirty", false),
    ]);
    this.deleted = new Set((await db.kvGet("deletedAttempts", [])) || []);
    this.attempts = attempts.sort((a, b) => a.t - b.t);
    this.cards = new Map(cards.map((c) => [c.id, c]));
    this.errors = new Map(errors.map((e) => [e.id, e]));
    this.texts = new Map(texts.map((t) => [t.id, t]));
    this.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    this.dirty = dirty;
  },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(what) { for (const fn of listeners) try { fn(what); } catch (e) { console.error(e); } },

  async setDirty(v = true) {
    this.dirty = v;
    await db.kvSet("dirty", v);
  },

  // ---------- Einstellungen ----------
  async saveSettings(patch) {
    this.settings = { ...this.settings, ...patch, updatedAt: Date.now() };
    await db.kvSet("settings", this.settings);
    await this.setDirty();
    this.emit("settings");
  },

  // ---------- Versuche ----------
  /**
   * @param {{modul:string, teil?:string, itemId?:string, score?:number, max?:number, sec?:number, xp?:number, meta?:object}} a
   */
  async addAttempt(a) {
    const rec = { id: uuid(), t: Date.now(), day: dayKey(), score: 0, max: 0, sec: 0, xp: 0, ...a };
    this.attempts.push(rec);
    await db.put("attempts", rec);
    await this.setDirty();
    this.emit("attempt");
    return rec;
  },

  async updateAttempt(rec) {
    await db.put("attempts", rec);
    await this.setDirty();
    this.emit("attempt");
  },

  /** Löscht Versuche dauerhaft – auch auf den anderen Geräten (Löschmarke wird synchronisiert). */
  async deleteAttempts(ids) {
    const set = new Set(ids);
    if (!set.size) return 0;
    this.attempts = this.attempts.filter((a) => !set.has(a.id));
    for (const id of set) { this.deleted.add(id); await db.delete("attempts", id); }
    await db.kvSet("deletedAttempts", [...this.deleted]);
    await this.setDirty();
    this.emit("attempt");
    return set.size;
  },

  attemptsFor(pred) {
    return this.attempts.filter(pred);
  },

  // ---------- Karten (SRS) ----------
  card(id) { return this.cards.get(id) || null; },
  async putCard(c) {
    c.updatedAt = Date.now();
    this.cards.set(c.id, c);
    await db.put("cards", c);
    await this.setDirty();
  },

  // ---------- Fehlerprotokoll ----------
  async addError(e) {
    // gleiche Aufgabe + gleiche Lösung = derselbe Fehler (Zähler erhöhen statt doppelt speichern)
    const key = `${e.modul}|${e.itemRef || ""}|${e.richtig || ""}`;
    const existing = [...this.errors.values()].find((x) => x.key === key && !x.resolved);
    const now = Date.now();
    const rec = existing
      ? { ...existing, gegeben: e.gegeben ?? existing.gegeben, count: (existing.count || 1) + 1, stage: 0, due: now, t: now }
      : { id: uuid(), key, t: now, count: 1, stage: 0, due: now, resolved: false, ...e };
    rec.updatedAt = now;
    this.errors.set(rec.id, rec);
    await db.put("errors", rec);
    await this.setDirty();
    this.emit("error");
    return rec;
  },
  async updateError(rec) {
    rec.updatedAt = Date.now();
    this.errors.set(rec.id, rec);
    await db.put("errors", rec);
    await this.setDirty();
  },

  // ---------- Texte ----------
  async saveText(t) {
    const rec = { id: t.id || uuid(), t: t.t || Date.now(), ...t, updatedAt: Date.now() };
    this.texts.set(rec.id, rec);
    await db.put("texts", rec);
    await this.setDirty();
    this.emit("text");
    return rec;
  },

  // ---------- Export / Abgleich ----------
  exportAll() {
    return {
      app: "c1-hochschule",
      version: 1,
      exportedAt: Date.now(),
      settings: this.settings,
      attempts: this.attempts,
      cards: [...this.cards.values()],
      errors: [...this.errors.values()],
      texts: [...this.texts.values()],
      deleted: [...this.deleted],
    };
  },

  /** Führt einen fremden Stand ein. Gibt true zurück, wenn sich lokal etwas geändert hat. */
  async mergeIn(remote) {
    if (!remote || remote.app !== "c1-hochschule") throw new Error("Unbekanntes Dateiformat.");
    let changed = false;
    // Löschmarken übernehmen und lokal anwenden
    const remDel = (remote.deleted || []).filter((id) => !this.deleted.has(id));
    if (remDel.length) {
      for (const id of remDel) this.deleted.add(id);
      await db.kvSet("deletedAttempts", [...this.deleted]);
      const gone = this.attempts.filter((a) => this.deleted.has(a.id));
      if (gone.length) {
        this.attempts = this.attempts.filter((a) => !this.deleted.has(a.id));
        for (const a of gone) await db.delete("attempts", a.id);
        changed = true;
      }
    }
    if ((remote.deleted || []).length < this.deleted.size) await this.setDirty(); // eigene Löschungen hochladen
    const ids = new Set(this.attempts.map((a) => a.id));
    const newAttempts = (remote.attempts || []).filter((a) => a && a.id && !ids.has(a.id) && !this.deleted.has(a.id));
    if (newAttempts.length) {
      await db.bulkPut("attempts", newAttempts);
      this.attempts.push(...newAttempts);
      this.attempts.sort((a, b) => a.t - b.t);
      changed = true;
    }
    for (const [name, map] of [["cards", this.cards], ["errors", this.errors], ["texts", this.texts]]) {
      const upd = [];
      for (const r of remote[name] || []) {
        if (!r || !r.id) continue;
        const l = map.get(r.id);
        if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) {
          map.set(r.id, r);
          upd.push(r);
        }
      }
      if (upd.length) {
        await db.bulkPut(name, upd);
        changed = true;
      }
    }
    if (remote.settings && (remote.settings.updatedAt || 0) > (this.settings.updatedAt || 0)) {
      this.settings = { ...DEFAULT_SETTINGS, ...remote.settings };
      await db.kvSet("settings", this.settings);
      changed = true;
    }
    if (changed) this.emit("merge");
    return changed;
  },

  async resetAll() {
    for (const s of ["attempts", "cards", "errors", "texts"]) await db.clear(s);
    await db.kvDel("settings");
    await this.init();
    this.emit("reset");
  },
};
