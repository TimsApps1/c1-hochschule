// Auswertung: Genauigkeit je Prüfungsteil, Prognose gegen die Bestehensgrenzen, Schwachstellen-Gewichte.
// Bestehen (telc C1 Hochschule): mind. 128/214 gesamt UND 99/166 schriftlich UND 29/48 mündlich.
import { store } from "./store.js";

export const TEILE = {
  lv1: { name: "Lesen 1 – Textrekonstruktion", group: "lesen", items: 6, per: 2, max: 12, min: 15 },
  lv2: { name: "Lesen 2 – Selektives Verstehen", group: "lesen", items: 6, per: 2, max: 12, min: 15 },
  lv3: { name: "Lesen 3 – Detailverstehen", group: "lesen", items: 12, per: 2, max: 24, min: 35 },
  sb: { name: "Sprachbausteine", group: "sb", items: 22, per: 1, max: 22, min: 25 },
  hv1: { name: "Hören 1 – Globalverstehen", group: "hoeren", items: 8, per: 1, max: 8, min: 8 },
  hv2: { name: "Hören 2 – Detailverstehen", group: "hoeren", items: 10, per: 2, max: 20, min: 12 },
  hv3: { name: "Hören 3 – Vortrag & Notizen", group: "hoeren", items: 10, per: 2, max: 20, min: 15 },
  sa: { name: "Schriftlicher Ausdruck", group: "schreiben", max: 48, min: 70 },
  mp: { name: "Mündlicher Ausdruck", group: "sprechen", max: 48, min: 16 },
};

export const GROUPS = {
  lesen: { name: "Leseverstehen", max: 48, base: 1.0, icon: "📖" },
  sb: { name: "Sprachbausteine", max: 22, base: 1.45, icon: "🧩" },
  hoeren: { name: "Hörverstehen", max: 48, base: 1.35, icon: "🎧" },
  schreiben: { name: "Schreiben", max: 48, base: 1.35, icon: "✍️" },
  sprechen: { name: "Sprechen", max: 48, base: 1.0, icon: "🎤" },
};

export const PASS = { total: 128, totalMax: 214, written: 99, writtenMax: 166, oral: 29, oralMax: 48 };

/** Gewichtete Genauigkeit der letzten n Versuche einer Gruppe (Prüfungsformat + Drills). */
export function groupAccuracy(group, n = 8) {
  const list = store.attempts.filter((a) => a.max > 0 && (a.modul === group || (group === "sb" && a.modul === "drill")) && !a.meta?.ohneWertung);
  if (!list.length) return { acc: null, n: 0, trend: [] };
  const recent = list.slice(-n);
  let s = 0, m = 0;
  recent.forEach((a, i) => {
    // Drills zählen halb, neuere Versuche etwas stärker
    const w = (a.modul === "drill" ? 0.5 : 1) * (1 + i / recent.length);
    s += (a.score / a.max) * w;
    m += w;
  });
  return { acc: s / m, n: list.length, trend: list.slice(-20).map((a) => ({ t: a.t, p: a.score / a.max })) };
}

export function teilAccuracy(teil, n = 6) {
  const list = store.attempts.filter((a) => a.teil === teil && a.max > 0);
  if (!list.length) return { acc: null, n: 0 };
  const recent = list.slice(-n);
  return { acc: recent.reduce((s, a) => s + a.score / a.max, 0) / recent.length, n: list.length };
}

/** Ehrliche Prognose: Punkte je Gruppe = Gruppen-Max × aktuelle Genauigkeit. Unbekannte Gruppen bleiben offen. */
export function forecast() {
  const parts = {};
  let written = 0, writtenKnown = true, oral = null;
  for (const [g, info] of Object.entries(GROUPS)) {
    const { acc, n } = groupAccuracy(g);
    const pts = acc == null ? null : Math.round(acc * info.max * 2) / 2;
    parts[g] = { ...info, acc, n, pts, sicher: n >= 4 };
    if (g === "sprechen") oral = pts;
    else if (pts == null) writtenKnown = false;
    else written += pts;
  }
  const total = writtenKnown && oral != null ? written + oral : null;
  return {
    parts,
    written: writtenKnown ? written : null,
    oral,
    total,
    writtenOk: writtenKnown ? written >= PASS.written : null,
    oralOk: oral != null ? oral >= PASS.oral : null,
    totalOk: total != null ? total >= PASS.total : null,
  };
}

/** Gewichte für die Tagessession: Schwächen + Grundpriorität (SB, Schreiben, Hören). */
export function weaknessWeights() {
  const w = {};
  for (const [g, info] of Object.entries(GROUPS)) {
    const { acc } = groupAccuracy(g);
    const a = acc == null ? 0.5 : acc;
    w[g] = info.base * (1 + Math.max(0, 0.8 - a) * 2);
  }
  return w;
}

export function errorCategories() {
  const m = new Map();
  for (const e of store.errors.values()) {
    const k = e.kategorie || "sonstiges";
    const r = m.get(k) || { kategorie: k, offen: 0, gesamt: 0 };
    r.gesamt += e.count || 1;
    if (!e.resolved) r.offen++;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.gesamt - a.gesamt);
}

export function dueErrors() {
  const now = Date.now();
  return [...store.errors.values()].filter((e) => !e.resolved && (e.due || 0) <= now && e.frage);
}
