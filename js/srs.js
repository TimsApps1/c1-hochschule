// Spaced Repetition (SM-2-Variante, an 30 Tage Prüfungsvorbereitung angepasst).
// Entscheidung: SM-2 statt FSRS – einfacher, robust und ohne trainierte Parameter; bei nur
// ~30 Tagen bis zur Prüfung bringt FSRS kaum Vorteile. Intervalle sind auf max. 9 Tage begrenzt,
// damit jedes Wort vor dem 12.12. mehrmals wiederholt wird.
import { store } from "./store.js";

const DAY = 86400000;
const MAX_INTERVAL = 9;

export function newCard(id, kind) {
  return { id, kind, reps: 0, ease: 2.5, interval: 0, due: 0, lapses: 0, correct: 0, wrong: 0, lastSeen: 0, seen: false };
}

/** q: 0 = falsch, 3 = richtig, 4 = richtig & leicht */
export async function review(id, kind, q) {
  const c = { ...(store.card(id) || newCard(id, kind)) };
  const now = Date.now();
  if (!c.firstSeen) c.firstSeen = now;
  c.seen = true;
  c.lastSeen = now;
  if (q < 3) {
    c.wrong++;
    c.lapses++;
    c.reps = 0;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 5 * 60 * 1000; // kommt in derselben Sitzung wieder
  } else {
    c.correct++;
    c.reps++;
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 3;
    else c.interval = Math.min(MAX_INTERVAL, Math.round(c.interval * c.ease));
    if (q >= 4) {
      c.ease += 0.1;
      c.interval = Math.min(MAX_INTERVAL, c.interval + 1);
    }
    c.due = startOfDay(now) + c.interval * DAY;
  }
  await store.putCard(c);
  return c;
}

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(4, 0, 0, 0); // fällig ab 4 Uhr morgens
  return d.getTime();
}

export function isLearned(c) {
  return !!c && c.reps >= 2;
}

/**
 * Wählt Karten für eine Runde: zuerst fällige (am längsten überfällig zuerst), dann neue.
 * @param {Array<{id:string}>} items alle Items dieser Art
 * @param {string} kind "wort" | "rw"
 * @param {number} n Rundengröße
 * @param {number} newLimit max. neue Karten heute
 */
export function pickCards(items, kind, n, newLimit) {
  const now = Date.now();
  const due = [];
  const fresh = [];
  for (const it of items) {
    const c = store.card(it.id);
    if (!c || !c.seen) fresh.push(it);
    else if (c.due <= now) due.push([it, c]);
  }
  due.sort((a, b) => a[1].due - b[1].due);
  const out = due.slice(0, n).map((x) => x[0]);
  const introducedToday = countNewToday(kind);
  const allowNew = Math.max(0, newLimit - introducedToday);
  const dueTaken = out.length;
  for (const it of fresh) {
    if (out.length >= n || out.length - dueTaken >= allowNew) break;
    out.push(it);
  }
  return out;
}

function countNewToday(kind) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const s = d.getTime();
  let n = 0;
  for (const c of store.cards.values()) if (c.kind === kind && (c.firstSeen || 0) >= s) n++;
  return n;
}

export function srsStats(kind) {
  let learned = 0, seen = 0, due = 0;
  const now = Date.now();
  for (const c of store.cards.values()) {
    if (c.kind !== kind || !c.seen) continue;
    seen++;
    if (isLearned(c)) learned++;
    if (c.due <= now) due++;
  }
  return { learned, seen, due };
}
