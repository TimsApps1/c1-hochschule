// Motivation: XP, Level, Streak (mit Freezes), Tages-/Wochenziel, Abzeichen, Countdown.
// Alles wird aus dem Versuchs-Log berechnet (siehe store.js).
import { store, dayKey } from "./store.js";
import { CONFIG } from "./config.js";
import { srsStats } from "./srs.js";

const DAY = 86400000;
export const MAX_FREEZES = 2;

export function xpByDay() {
  const m = new Map();
  for (const a of store.attempts) m.set(a.day, (m.get(a.day) || 0) + (a.xp || 0));
  return m;
}

export function totalXp() {
  return store.attempts.reduce((s, a) => s + (a.xp || 0), 0);
}

// Level n erreicht man bei 50·n·(n−1) XP: L2 = 100, L3 = 300, L4 = 600, L5 = 1000 …
export function levelInfo(xp = totalXp()) {
  let n = 1;
  while (50 * (n + 1) * n <= xp) n++;
  const cur = 50 * n * (n - 1);
  const next = 50 * (n + 1) * n;
  return { level: n, cur, next, into: xp - cur, need: next - cur };
}

function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

/** Streak mit Freezes. Ein Tag zählt, sobald XP > 0. Freezes verdient man durch Bonusrunden. */
export function streakInfo() {
  const byDay = xpByDay();
  const earned = new Map();
  for (const a of store.attempts) if (a.modul === "bonus" && a.meta?.freeze) earned.set(a.day, (earned.get(a.day) || 0) + 1);
  const today = dayKey();
  const days = [...byDay.keys()].filter((d) => byDay.get(d) > 0).sort();
  if (!days.length) return { streak: 0, freezes: 0, frozenDays: [], activeToday: false, best: 0 };
  let streak = 0, best = 0, held = 0;
  const frozenDays = [];
  for (let d = days[0]; d < today; d = addDays(d, 1)) {
    if ((byDay.get(d) || 0) > 0) streak++;
    else if (held > 0) { held--; frozenDays.push(d); }
    else streak = 0;
    held = Math.min(MAX_FREEZES, held + (earned.get(d) || 0));
    best = Math.max(best, streak);
  }
  const activeToday = (byDay.get(today) || 0) > 0;
  if (activeToday) streak++;
  held = Math.min(MAX_FREEZES, held + (earned.get(today) || 0));
  best = Math.max(best, streak);
  return { streak, freezes: held, frozenDays, activeToday, best };
}

export function todayXp() {
  return xpByDay().get(dayKey()) || 0;
}

export function weekXp() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Mo = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const start = dayKey(monday);
  let s = 0;
  for (const [d, x] of xpByDay()) if (d >= start) s += x;
  return s;
}

export function daysUntilExam() {
  const [y, m, d] = CONFIG.EXAM_DATE.split("-").map(Number);
  const exam = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((exam - today) / DAY);
}

export function studyMinutes(day) {
  let s = 0;
  for (const a of store.attempts) if (!day || a.day === day) s += a.sec || 0;
  return Math.round(s / 60);
}

// ---------- Abzeichen ----------
export const BADGES = [
  { id: "start", icon: "🌱", name: "Erster Schritt", desc: "Die erste Übung abgeschlossen", test: (c) => c.attempts >= 1 },
  { id: "einstufung", icon: "🧭", name: "Standort bestimmt", desc: "Einstufungstest gemacht", test: (c) => c.mod.einstufung >= 1 },
  { id: "streak3", icon: "🔥", name: "Drei Tage am Stück", desc: "3-Tage-Streak", test: (c) => c.best >= 3 },
  { id: "streak7", icon: "🔥", name: "Eine ganze Woche", desc: "7-Tage-Streak", test: (c) => c.best >= 7 },
  { id: "streak14", icon: "🏅", name: "Zwei Wochen dran", desc: "14-Tage-Streak", test: (c) => c.best >= 14 },
  { id: "streak25", icon: "🏆", name: "Durchgezogen", desc: "25-Tage-Streak", test: (c) => c.best >= 25 },
  { id: "xp1000", icon: "⭐", name: "1000 XP", desc: "1000 Erfahrungspunkte gesammelt", test: (c) => c.xp >= 1000 },
  { id: "xp5000", icon: "🌟", name: "5000 XP", desc: "5000 Erfahrungspunkte gesammelt", test: (c) => c.xp >= 5000 },
  { id: "sb10", icon: "🧩", name: "Bausteinmeisterin", desc: "10 Sprachbaustein-Sets gelöst", test: (c) => c.mod.sb >= 10 },
  { id: "woerter100", icon: "📚", name: "100 Wörter", desc: "100 Wörter sicher gelernt", test: (c) => c.words >= 100 },
  { id: "woerter300", icon: "📖", name: "300 Wörter", desc: "300 Wörter sicher gelernt", test: (c) => c.words >= 300 },
  { id: "rw50", icon: "💬", name: "Redegewandt", desc: "50 Redewendungen gelernt", test: (c) => c.idioms >= 50 },
  { id: "text1", icon: "✍️", name: "Erster Text", desc: "Den ersten Text geschrieben", test: (c) => c.mod.schreiben >= 1 },
  { id: "text10", icon: "🖋️", name: "Vielschreiberin", desc: "10 Texte geschrieben", test: (c) => c.mod.schreiben >= 10 },
  { id: "hoeren10", icon: "🎧", name: "Gute Ohren", desc: "10 Hörtexte bearbeitet", test: (c) => c.mod.hoeren >= 10 },
  { id: "lesen10", icon: "🔎", name: "Leseratte", desc: "10 Lesetexte bearbeitet", test: (c) => c.mod.lesen >= 10 },
  { id: "sprechen5", icon: "🎤", name: "Bühne frei", desc: "5 Sprechübungen gemacht", test: (c) => c.mod.sprechen >= 5 },
  { id: "fehler20", icon: "🛠️", name: "Aus Fehlern lernen", desc: "20 Fehler endgültig behoben", test: (c) => c.fixed >= 20 },
  { id: "pruefung1", icon: "🎓", name: "Generalprobe", desc: "Eine komplette Probeprüfung gemacht", test: (c) => c.mod.pruefung >= 1 },
  { id: "bonus", icon: "❄️", name: "Eisig gut", desc: "Einen Streak-Freeze verdient", test: (c) => c.mod.bonus >= 1 },
];

export function badgeContext() {
  const mod = new Proxy({}, { get: (o, k) => o[k] || 0 });
  for (const a of store.attempts) if (a.max > 0 || a.modul === "einstufung" || a.modul === "pruefung" || a.modul === "bonus" || a.modul === "schreiben" || a.modul === "sprechen") mod[a.modul] = (mod[a.modul] || 0) + 1;
  const s = streakInfo();
  return {
    attempts: store.attempts.length,
    mod,
    best: s.best,
    xp: totalXp(),
    words: srsStats("wort").learned,
    idioms: srsStats("rw").learned,
    fixed: [...store.errors.values()].filter((e) => e.resolved).length,
  };
}

export function earnedBadges() {
  const c = badgeContext();
  return BADGES.filter((b) => b.test(c)).map((b) => b.id);
}

// ---------- Gesamtfortschritt (Weg zur Prüfung, 0–100 %) ----------
// Gewichtet: Lernpfad 40 %, Prüfungsteile geübt 25 %, Wortschatz 12 %, Redewendungen 8 %, Fehler behoben 5 %, Generalproben 10 %.
// Zielmengen sind bewusst erreichbar (realistisch in 30 Tagen mit 1–2 Std./Tag).
const TEIL_ZIELE = { sb: 15, lv1: 4, lv2: 4, lv3: 4, hv1: 4, hv2: 4, hv3: 4, sa: 8, sprechen: 8 };

export function overallProgress(totalDays = 20) {
  const done = (pred) => store.attempts.filter(pred).length;
  const lernpfad = Math.min(1, new Set(store.attempts.filter((a) => a.modul === "lektion").map((a) => a.itemId)).size / totalDays);
  const teile = Object.entries(TEIL_ZIELE).map(([t, ziel]) => {
    const n = t === "sprechen" ? done((a) => a.modul === "sprechen") : done((a) => a.teil === t && a.max > 0);
    return Math.min(1, n / ziel);
  });
  const pruefungsteile = teile.reduce((s, x) => s + x, 0) / teile.length;
  const wortschatz = Math.min(1, srsStats("wort").learned / 300);
  const redewendungen = Math.min(1, srsStats("rw").learned / 120);
  const errs = [...store.errors.values()];
  const fehler = errs.length ? errs.filter((e) => e.resolved).length / errs.length : 0;
  const proben = Math.min(1, new Set(store.attempts.filter((a) => a.modul === "pruefung").map((a) => a.itemId)).size / 2);
  const parts = [
    { name: "Lernpfad", icon: "🗺️", v: lernpfad, w: 40 },
    { name: "Prüfungsteile geübt", icon: "📝", v: pruefungsteile, w: 25 },
    { name: "Wortschatz (300 Wörter)", icon: "📚", v: wortschatz, w: 12 },
    { name: "Redewendungen (120)", icon: "💬", v: redewendungen, w: 8 },
    { name: "Fehler behoben", icon: "🛠️", v: fehler, w: 5 },
    { name: "Generalproben (2)", icon: "🎓", v: proben, w: 10 },
  ];
  const pct = Math.round(parts.reduce((s, p) => s + p.v * p.w, 0));
  return { pct, parts };
}

export const MEILENSTEINE = [10, 25, 50, 75, 90, 100];
export function milestoneText(m) {
  return {
    10: "Die ersten 10 % – der Anfang ist gemacht! 🌱",
    25: "Ein Viertel geschafft! Du bist voll im Rhythmus. 💪",
    50: "Halbzeit! Die Hälfte des Weges liegt hinter dir. 🎉",
    75: "75 %! Die Prüfung kann kommen. 🔥",
    90: "90 % – du bist fast am Ziel! 🏁",
    100: "100 %! Du hast alles geschafft. Du bist bereit für den 12.12.! 🎓",
  }[m];
}

// ---------- Erfolgsmeldungen ----------
const PRAISE = [
  "Stark gemacht!", "Sehr gut!", "Genau so!", "Weiter so – das sitzt!", "Prima, das war C1-Niveau!",
  "Klasse!", "Super, du wirst immer sicherer.", "Toll durchgehalten!", "Ausgezeichnet!", "Das läuft richtig gut!",
];
const COMFORT = [
  "Kein Problem – genau dafür üben wir.", "Fast! Schau dir die Erklärung kurz an.", "Fehler sind Lernchancen – er landet im Fehlerprotokoll.",
  "Nicht schlimm, beim nächsten Mal sitzt es.", "Gut, dass es jetzt passiert und nicht am 12.12.",
];
export const praise = () => {
  const n = store.settings.name;
  if (n && Math.random() < 0.2) return `Sehr gut, ${n}!`;
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
};
export const comfort = () => COMFORT[Math.floor(Math.random() * COMFORT.length)];
