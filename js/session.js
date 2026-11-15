// Lernpfad, Tagessession, Einstufungstest, Teiltests, Generalproben, Bonusrunde.
// Tagessession = Aufwärmen (Wortschatz + Redewendungen) → Hauptblock des Tages (Lernpfad) → Fehlerwiederholung.
// Fortschritt innerhalb einer Session wird gespeichert, man kann jederzeit pausieren.
import { h, clear, md, sample, shuffle, toast, confetti } from "./ui.js";
import { mascot, emptyBox, thinking } from "./mascot.js";
import { load, pool, reserved, KATEGORIEN } from "./content.js";
import { store, dayKey } from "./store.js";
import { db } from "./db.js";
import { srsRound } from "./vocab.js";
import { sbExam, drillRound, grammarCard } from "./sb.js";
import { lesenExam } from "./lesen.js";
import { hoerenExam } from "./hoeren.js";
import { schreibenTask } from "./schreiben.js";
import { praesentation, diskussion } from "./sprechen.js";
import { errorReview } from "./fehler.js";
import { aufgabenRound } from "./aufgaben.js";
import { weaknessWeights, GROUPS, groupAccuracy, PASS } from "./analytics.js";
import { resultScreen, runQuiz } from "./quiz.js";
import { ai, S } from "./ai.js";
import { MAX_FREEZES, streakInfo } from "./gamify.js";

// ---------- Lernpfad ----------
export async function lernpfad() {
  return load("lernpfad");
}
export function dayDone(tag) {
  return store.attempts.some((a) => a.modul === "lektion" && a.itemId === "tag-" + tag);
}
export function unlockedUpTo(days) {
  let n = 1;
  for (const d of days) if (dayDone(d.tag)) n = d.tag + 1;
  return Math.min(n, days.length);
}
/** Der heute vorgesehene Tag: erster nicht erledigter (Freischaltung nacheinander). */
export function currentDay(days) {
  return days.find((d) => !dayDone(d.tag)) || days[days.length - 1];
}
export function calendarDay(days) {
  const today = dayKey();
  return days.find((d) => d.datum === today) || null;
}

// ---------- Items auswählen ----------
function wocheNiveau(woche) {
  return woche <= 1 ? ["B2+", "C1"] : woche === 2 ? ["C1", "B2+", "C1+"] : ["C1", "C1+"];
}
function lastDone(id) {
  let t = 0;
  for (const a of store.attempts) if (a.itemId === id && a.t > t) t = a.t;
  return t;
}
export function pickItem(list, { woche = 2, exclude = [] } = {}) {
  const cand = pool(list).filter((x) => !exclude.includes(x.id) && !x.einstufung);
  const all = cand.length ? cand : pool(list);
  if (!all.length) return null;
  const pref = wocheNiveau(woche);
  const scored = all.map((x) => {
    const done = lastDone(x.id);
    const nivIdx = pref.indexOf(x.niveau || "C1");
    return { x, score: (done ? 1e13 + done : 0) + (nivIdx < 0 ? 5e12 : nivIdx * 1e12) + Math.random() * 1e11 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].x;
}

// ---------- Schritte ----------
export function stepLabel(s) {
  const T = { lv1: "Lesen 1", lv2: "Lesen 2", lv3: "Lesen 3", hv1: "Hören 1", hv2: "Hören 2", hv3: "Hören 3", "1a": "Präsentation 1A/1B", "2": "Diskussion Teil 2" };
  const M = (m) => (m === "pruefung" ? " ⏱" : "");
  switch (s.typ) {
    case "einstufung": return "🧭 Einstufungstest";
    case "strategie": return "💡 Strategie: " + (STRATEGIE_NAMEN[s.teil] || s.teil);
    case "grammatik": return "📐 Grammatik: " + (KATEGORIEN[s.kategorie] || s.kategorie);
    case "sb": return "🧩 Sprachbausteine" + M(s.modus);
    case "lesen": return "📖 " + T[s.teil] + M(s.modus);
    case "hoeren": return "🎧 " + T[s.teil] + M(s.modus);
    case "schreiben": return "✍️ Schreiben" + (s.modus === "pruefung" ? " (70 Min.)" : "");
    case "sprechen": return "🎤 " + T[s.teil];
    case "teiltest": return s.bereich === "hoeren" ? "🎧 Teiltest Hören (40 Min.)" : "📖 Teiltest Lesen + SB (90 Min.)";
    case "generalprobe": return "🎓 Generalprobe " + s.nr + (s.teil ? ` (${s.teil})` : "");
    case "auto": return "🎯 Schwachstelle trainieren";
    case "fehler": return "🛠️ Fehlerwiederholung";
    case "wortschatz": return "📚 Wortschatz";
    case "redewendungen": return "💬 Redewendungen";
    case "checkliste": return "✅ Checkliste Prüfungstag";
    case "aufgaben": return "🧐 Aufgaben verstehen";
    case "warmup": return "🔥 Aufwärmen: Wortschatz";
    case "warmup_rw": return "🔥 Aufwärmen: Redewendungen";
    default: return s.typ;
  }
}
const STRATEGIE_NAMEN = { ueberblick: "Die Prüfung im Überblick", sb: "Sprachbausteine", lv1: "Lesen 1", lv2: "Lesen 2", lv3: "Lesen 3", hv1: "Hören 1", hv2: "Hören 2", hv3: "Hören 3", schreiben: "Schreiben", sprechen_1a: "Präsentation", sprechen_1b: "Anschlussfragen", sprechen_2: "Diskussion", zeitmanagement: "Zeitmanagement", notizen: "Notiztechnik" };

/** Wählt für "auto" einen Schritt nach Schwäche (gewichtete Zufallsauswahl). */
function autoStep() {
  const w = weaknessWeights();
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let g = "sb";
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) { g = k; break; } }
  if (g === "sb") return Math.random() < 0.5 ? { typ: "sb", modus: "pruefung" } : { typ: "grammatik", kategorie: weakestGrammar() };
  if (g === "lesen") return { typ: "lesen", teil: sample(["lv1", "lv2", "lv3"], 1)[0], modus: "pruefung" };
  if (g === "hoeren") return { typ: "hoeren", teil: sample(["hv1", "hv2", "hv3"], 1)[0], modus: "pruefung" };
  if (g === "schreiben") return { typ: "schreiben", modus: "uebung" };
  return { typ: "sprechen", teil: Math.random() < 0.5 ? "1a" : "2" };
}
function weakestGrammar() {
  const m = new Map();
  for (const e of store.errors.values()) if (!e.resolved && ["sb", "drill"].includes(e.modul)) m.set(e.kategorie, (m.get(e.kategorie) || 0) + (e.count || 1));
  const list = [...m.entries()].filter(([k]) => KATEGORIEN[k]).sort((a, b) => b[1] - a[1]);
  return list.length ? list[0][0] : sample(["konnektoren", "praepositionen", "rektion", "passiv", "relativsatz", "deklination"], 1)[0];
}

/** Führt einen Schritt aus. Gibt {xp, score?, max?, aborted?} zurück. */
export async function runStep(el, step, ctx = {}) {
  const woche = ctx.woche || 2;
  if (step.typ === "auto") step = autoStep();
  switch (step.typ) {
    case "einstufung": return einstufung(el);
    case "strategie": return strategieKarte(el, step.teil);
    case "grammatik": {
      clear(el);
      const card = await grammarCard(step.kategorie);
      const go = await new Promise((res) => el.append(h("div.ex-head", h("span"), h("strong", "Grammatik"), h("span")), card, h("button.btn.primary.wide", { onclick: () => res(true) }, "Jetzt üben (10 Aufgaben)")));
      return drillRound(el, step.kategorie, 10, { embedded: false });
    }
    case "sb": {
      const set = pickItem(await load("sb"), { woche });
      if (!set) return empty(el);
      return sbExam(el, set, { mode: step.modus, minutes: 25 });
    }
    case "lesen": {
      const item = pickItem((await load("lesen")).filter((x) => x.teil === step.teil), { woche });
      if (!item) return empty(el);
      return lesenExam(el, item, { mode: step.modus });
    }
    case "hoeren": {
      const item = pickItem((await load("hoeren")).filter((x) => x.teil === step.teil), { woche });
      if (!item) return empty(el);
      return hoerenExam(el, item, { mode: step.modus });
    }
    case "schreiben": {
      const all = await load("schreiben");
      if (step.modus === "pruefung") {
        const paare = [...new Set(pool(all).map((t) => t.paar))];
        const p = paare.sort((a, b) => Math.max(...all.filter((t) => t.paar === a).map((t) => lastDone(t.id))) - Math.max(...all.filter((t) => t.paar === b).map((t) => lastDone(t.id))))[0];
        const tasks = all.filter((t) => t.paar === p);
        if (!tasks.length) return empty(el);
        return schreibenTask(el, tasks, { mode: "pruefung", minutes: 70 });
      }
      const t = pickItem(all, { woche });
      if (!t) return empty(el);
      return schreibenTask(el, [t], { mode: "uebung" });
    }
    case "sprechen": {
      const sp = await load("sprechen");
      if (step.teil === "2") {
        const d = pickItem(sp.diskussion, { woche });
        return d ? diskussion(el, d) : empty(el);
      }
      const b = pickItem(sp.praesentation, { woche });
      return b ? praesentation(el, b) : empty(el);
    }
    case "teiltest": return teiltest(el, step.bereich, woche);
    case "generalprobe": {
      const { generalprobe } = await import("./pruefung.js");
      return generalprobe(el, step.nr, step.teil);
    }
    case "fehler": {
      const r = await errorReview(el, { n: 12 });
      return r.empty ? { xp: 0, skipped: true } : r;
    }
    case "wortschatz": case "warmup": return srsRound(el, "wort", { n: step.typ === "warmup" ? 8 : 12, title: "Aufwärmen" });
    case "redewendungen": case "warmup_rw": return srsRound(el, "rw", { n: step.typ === "warmup_rw" ? 5 : 10 });
    case "checkliste": return checkliste(el);
    case "aufgaben": { const r = await aufgabenRound(el, { n: step.n || 3 }); return r.empty ? { xp: 0, skipped: true } : r; }
  }
  return { xp: 0 };
}

function empty(el) {
  clear(el).append(emptyBox("Für diesen Schritt sind noch keine Inhalte da. Er wird übersprungen."));
  return new Promise((res) => el.append(h("button.btn.primary.wide", { onclick: () => res({ xp: 0, skipped: true }) }, "Weiter")));
}

// ---------- Tagessession ----------
export function sessionSteps(day) {
  // An Tagen mit Einstufung oder Generalprobe kein Aufwärmen (die Zeit gehört dem Test)
  const big = day.schritte.some((s) => s.typ === "einstufung" || s.typ === "generalprobe");
  const warm = big ? [] : [{ typ: "warmup" }, { typ: "warmup_rw" }];
  const tail = big || day.schritte.some((s) => s.typ === "fehler") ? [] : [{ typ: "fehler" }];
  // Neu: „Aufgaben verstehen“ am Ende (Woche 1–3) – hinten angehängt, damit begonnene Tage ihren Stand behalten
  const verstehen = !big && day.woche <= 3 ? [{ typ: "aufgaben", n: 3 }] : [];
  return [...warm, ...day.schritte, ...tail, ...verstehen];
}

export async function runDay(el, day, nav) {
  const key = "session." + day.tag;
  const state = (await db.kvGet(key)) || { done: [], resolved: {} };
  const steps = sessionSteps(day);
  const overview = () => new Promise((resolve) => {
    clear(el);
    const doneCount = state.done.length;
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve("exit") }, "✕"), h("div", h("strong", `Tag ${day.tag}: ${day.titel}`), h("div.muted.small", `Woche ${day.woche}`)), h("span")),
      day.hinweis ? h("p.callout", day.hinweis) : null,
      h("ol.steps", steps.map((s, i) => h("li" + (state.done.includes(i) ? ".done" : ""), h("span", stepLabel(state.resolved[i] || s)), state.done.includes(i) ? h("span", "✓") : null))),
      h("button.btn.primary.wide", { onclick: () => resolve("go") }, doneCount ? "Weiter lernen" : "Los geht's"),
      doneCount ? h("p.muted.small.center", `${doneCount}/${steps.length} Schritte erledigt – du kannst jederzeit pausieren.`) : null);
  });
  while (true) {
    const next = steps.findIndex((_, i) => !state.done.includes(i));
    if (next < 0) break;
    const act = await overview();
    if (act === "exit") return nav("#/");
    const step = steps[next];
    const res = await runStep(el, step, { woche: day.woche });
    if (res && res.aborted && !res.empty) continue; // zurück zur Übersicht, Schritt bleibt offen
    state.done.push(next);
    await db.kvSet(key, state);
  }
  // Tag abgeschlossen
  if (!dayDone(day.tag)) await store.addAttempt({ modul: "lektion", itemId: "tag-" + day.tag, xp: 20 });
  confetti();
  clear(el);
  const s = streakInfo();
  await new Promise((resolve) => el.append(h("div.result",
    mascot("cheer", 140, "bounce"), h("h2", `Tag ${day.tag} geschafft!`), h("div.xp-pill", "+20 XP Tagesbonus"),
    h("p", `🔥 Streak: ${s.streak} Tag(e)`),
    s.freezes < MAX_FREEZES ? h("button.btn.wide", { onclick: () => { resolve(); nav("#/bonus"); } }, "❄️ Bonusrunde (5 Min.) – Streak-Freeze verdienen") : h("p.muted.small", "Du hast schon 2 Streak-Freezes."),
    h("button.btn.primary.wide", { onclick: () => { resolve(); nav("#/"); } }, "Zur Startseite"))));
}

// ---------- Bonusrunde ----------
export async function bonusRound(el, nav) {
  const drills = await load("drills");
  const words = await load("wortschatz");
  const items = [];
  for (const d of sample(drills.filter((x) => x.typ !== "umformung"), 6)) items.push({ label: KATEGORIEN[d.kategorie], prompt: d.satz.replace("___", "_____"), options: d.optionen, correct: d.loesung, explain: d.erklaerung });
  for (const w of sample(words.filter((x) => x.luecke), 4)) items.push({ label: "Wortschatz", prompt: w.luecke.satz.replace("___", "_____"), options: w.luecke.optionen, correct: w.luecke.optionen.indexOf(w.luecke.loesung), explain: `**${w.wort}** – ${w.erklaerung}` });
  if (items.length < 4) { toast("Noch nicht genug Inhalte für die Bonusrunde."); return nav("#/"); }
  const res = await runQuiz(el, { title: "❄️ Bonusrunde", intro: "Mindestens 70 % richtig = ein Streak-Freeze (max. 2).", items: shuffle(items), retryWrong: false });
  if (res.aborted) return nav("#/");
  const ok = res.score / res.max >= 0.7;
  const before = streakInfo().freezes;
  await store.addAttempt({ modul: "bonus", score: res.score, max: res.max, sec: res.sec, xp: 10 + res.score, meta: { freeze: ok && before < MAX_FREEZES, ohneWertung: true } });
  await resultScreen(el, { title: ok ? "❄️ Streak-Freeze verdient!" : "Knapp vorbei", score: res.score, max: res.max, xp: 10 + res.score, extra: h("p.muted", ok ? "Wenn du einen Tag verpasst, bleibt deine Flamme trotzdem an." : "Für den Freeze brauchst du 70 %. Morgen wieder!") });
  nav("#/");
}

// ---------- Strategiekarten ----------
const UEBERBLICK = {
  titel: "Die Prüfung im Überblick",
  punkte: [
    "**Schriftlich (200 Min. + 20 Min. Pause):** Lesen 1–3 + Sprachbausteine zusammen 90 Min. → Pause → Hören 1–3 ca. 40 Min. → Schreiben 70 Min.",
    "**Mündlich (ca. 16 Min., zu zweit):** 20 Min. Vorbereitung → 1A Präsentation (3–4 Min.) → 1B Partner fasst zusammen und fragt → Teil 2 Diskussion (ca. 6 Min.).",
    "**Schreiben:** 1 von 2 Themen, zwei gegensätzliche Zitate, Erörterung/Stellungnahme, **mind. 350 Wörter**. Keine Grafik!",
    "**Punkte:** Lesen 48 · SB 22 · Hören 48 · Schreiben 48 = 166 schriftlich; mündlich 48. Gesamt 214.",
    "**Bestehen:** mind. **99/166** schriftlich **und** **29/48** mündlich **und** 128/214 gesamt (je ≈ 60 %).",
    "**Kein Wörterbuch.** Jeder Hörtext läuft **nur einmal**. Antworten auf den Antwortbogen übertragen!",
  ],
};
export async function strategieKarte(el, teil, standalone = false) {
  const st = await load("strategie");
  const k = teil === "ueberblick" ? UEBERBLICK : (st.karten || []).find((x) => x.teil === teil || x.id === "st_" + teil);
  clear(el);
  return new Promise((resolve) => {
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve({ xp: 0 }) }, "✕"), h("strong", "Strategie"), h("span")),
      k ? h("div.strategy", h("h2", "💡 " + k.titel), k.zeit ? h("div.chip", "⏱ " + k.zeit) : null, h("ul", (k.punkte || []).map((p) => h("li", { html: md(p) }))), k.falle ? h("p.callout", "⚠️ " + k.falle) : null)
        : h("p.muted", "Strategiekarte wird noch erstellt."),
      h("button.btn.primary.wide", { onclick: async () => { if (!standalone) await store.addAttempt({ modul: "strategie", itemId: teil, xp: 3 }); resolve({ xp: 3 }); } }, standalone ? "Zurück" : "Verstanden"));
  });
}

async function checkliste(el) {
  const st = await load("strategie");
  clear(el);
  return new Promise((resolve) => {
    el.append(h("h2", "✅ Prüfungstag 12.12."),
      (st.pruefungstag || []).map((g) => h("div.card", h("strong", g.gruppe), h("div.checks", g.punkte.map((p) => h("label.check", h("input", { type: "checkbox" }), h("span", p)))))),
      h("button.btn.primary.wide", { onclick: async () => { await store.addAttempt({ modul: "strategie", itemId: "checkliste", xp: 5 }); resolve({ xp: 5 }); } }, "Fertig"));
  });
}

// ---------- Teiltests ----------
async function teiltest(el, bereich, woche) {
  const parts = [];
  if (bereich === "hoeren") {
    const all = await load("hoeren");
    for (const t of ["hv1", "hv2", "hv3"]) { const it = pickItem(all.filter((x) => x.teil === t), { woche: 3 }); if (it) parts.push(() => hoerenExam(el, it, { mode: "pruefung" })); }
  } else {
    const lesen = await load("lesen");
    for (const t of ["lv1", "lv2", "lv3"]) { const it = pickItem(lesen.filter((x) => x.teil === t), { woche: 3 }); if (it) parts.push(() => lesenExam(el, it, { mode: "pruefung" })); }
    const sb = pickItem(await load("sb"), { woche: 3 });
    if (sb) parts.push(() => sbExam(el, sb, { mode: "pruefung", minutes: 25 }));
  }
  if (!parts.length) return empty(el);
  let score = 0, max = 0, xp = 0;
  for (const p of parts) {
    const r = await p();
    if (r.aborted) return { aborted: true };
    score += r.score; max += r.max; xp += r.xp || 0;
  }
  await resultScreen(el, { title: bereich === "hoeren" ? "Teiltest Hören" : "Teiltest Lesen + SB", score, max, xp });
  return { score, max, xp };
}

// ---------- Einstufungstest (ca. 25 Min.) ----------
export async function einstufung(el) {
  const res = {};
  clear(el);
  await new Promise((r) => el.append(h("div.result", mascot("wave", 130, "bounce"), h("h2", "Einstufungstest"),
    h("p", "Ca. 25 Minuten: Sprachbausteine, Wortschatz, Lesen, Hören und ein kurzer Text. Danach weiß die App, wo sie dich am meisten unterstützen soll."),
    h("p.muted.small", "Keine Sorge wegen Fehlern – genau die wollen wir finden."),
    h("button.btn.primary.wide", { onclick: r }, "Starten"))));
  // 1. Sprachbausteine (12 Lücken)
  const sbAll = await load("sb");
  const sbSet = sbAll.find((x) => x.einstufung) || pool(sbAll)[0];
  if (sbSet) {
    const r = await sbExam(el, sbSet, { mode: "pruefung", minutes: 10, onlyFirst: 12, noAttempt: true });
    if (r.aborted) return { aborted: true };
    res.sb = r.score / r.max;
    await store.addAttempt({ modul: "sb", teil: "sb", itemId: sbSet.id + ":einstufung", score: r.score, max: r.max, sec: r.sec, xp: 10, meta: { einstufung: true } });
  }
  // 2. Wortschatz (10 Bedeutungen)
  const words = await load("wortschatz");
  if (words.length > 20) {
    const pickW = sample(words, 10);
    const items = pickW.map((w) => {
      const others = sample(words.filter((x) => x.id !== w.id && x.wortart === w.wortart), 3).map((x) => x.erklaerung);
      return { label: "Wortschatz", prompt: `Was bedeutet **${w.wort}**?`, options: [w.erklaerung, ...others], correct: 0, explain: `„${w.beispiel}“` };
    });
    const r = await runQuiz(el, { title: "Einstufung: Wortschatz", items, retryWrong: false });
    if (r.aborted) return { aborted: true };
    res.wortschatz = r.score / r.max;
    await store.addAttempt({ modul: "wortschatz", score: r.score, max: r.max, sec: r.sec, xp: 5, meta: { einstufung: true, ohneWertung: true } });
  }
  // 3. Lesen 1
  const lesen = await load("lesen");
  const lv = lesen.find((x) => x.einstufung) || pool(lesen).find((x) => x.teil === "lv1");
  if (lv) {
    const r = await lesenExam(el, lv, { mode: "pruefung", embedded: { noAttempt: true } });
    if (r.aborted) return { aborted: true };
    res.lesen = r.score / r.max;
    await store.addAttempt({ modul: "lesen", teil: lv.teil, itemId: lv.id + ":einstufung", score: r.score, max: r.max, sec: r.sec, xp: 10, meta: { einstufung: true } });
  }
  // 4. Hören 1
  const hoeren = await load("hoeren");
  const hv = hoeren.find((x) => x.einstufung) || pool(hoeren).find((x) => x.teil === "hv1");
  if (hv) {
    const r = await hoerenExam(el, hv, { mode: "pruefung", embedded: { noAttempt: true } });
    if (r.aborted) return { aborted: true };
    res.hoeren = r.score / r.max;
    await store.addAttempt({ modul: "hoeren", teil: hv.teil, itemId: hv.id + ":einstufung", score: r.score, max: r.max, sec: r.sec, xp: 10, meta: { einstufung: true } });
  }
  // 5. Kurzer Text (optional KI)
  res.schreiben = await miniWriting(el);
  await store.addAttempt({ modul: "einstufung", xp: 30, meta: res });
  // Auswertung
  clear(el);
  const rows = Object.entries({ sb: "Sprachbausteine", wortschatz: "Wortschatz", lesen: "Lesen", hoeren: "Hören", schreiben: "Schreiben" })
    .filter(([k]) => res[k] != null)
    .map(([k, name]) => h("div.cat-row", h("div.cat-name", name, h("span.muted.small", ` ${Math.round(res[k] * 100)} %`)), h("div.bar" + (res[k] >= 0.6 ? ".good" : ".bad"), h("span", { style: { width: Math.round(res[k] * 100) + "%" } }))));
  const weak = Object.entries(res).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k]) => ({ sb: "Sprachbausteine", wortschatz: "Wortschatz", lesen: "Lesen", hoeren: "Hören", schreiben: "Schreiben" })[k]);
  confetti();
  return new Promise((resolve) => el.append(h("div.result", mascot("proud", 130, "bounce"), h("h2", "Dein Startpunkt"), h("div.xp-pill", "+30 XP"), h("div.card", rows),
    h("p", `Deine Schwerpunkte: **${weak.join("** und **")}**. Die Tagessessions gewichten diese Bereiche ab jetzt stärker.`.replace(/\*\*/g, "")),
    h("p.muted.small", "Ein kurzer Test ist nur eine grobe Schätzung – die Prognose wird mit jeder Übung genauer."),
    h("button.btn.primary.wide", { onclick: () => resolve({ xp: 30 }) }, "Weiter"))));
}

async function miniWriting(el) {
  clear(el);
  return new Promise((resolve) => {
    const ta = h("textarea.writing", { rows: 8, placeholder: "5–8 Sätze …" });
    el.append(h("div.ex-head", h("span"), h("strong", "Einstufung: Kurzer Text"), h("span")),
      h("div.task-box", h("p", "Schreiben Sie 5–8 Sätze (ca. 80–120 Wörter):"), h("p", h("strong", "„Lehrkräfte aus dem Ausland sollten in Deutschland schneller unterrichten dürfen.“ – Wie sehen Sie das? Begründen Sie Ihre Meinung."))),
      ta,
      h("div.row",
        h("button.btn", { onclick: () => resolve(null) }, "Überspringen"),
        h("button.btn.primary", { onclick: async () => {
          const text = ta.value.trim();
          if (text.split(/\s+/).length < 30) return toast("Bitte mindestens 30 Wörter.");
          if ((await ai.available()).ok) {
            clear(el).append(thinking(h("p", "Wird eingeschätzt …")));
            try {
              const { data } = await ai.call({
                system: "Du bist telc-Bewerterin (C1 Hochschule). Schätze einen kurzen Einstufungstext ein. Antworte auf Deutsch, einfach.",
                messages: [{ role: "user", content: `Kurzer Meinungstext (Einstufung):\n"""${text}"""\nGib eine Einschätzung 0–100 (60 = knapp C1-Prüfungsniveau im Schreiben), das geschätzte Niveau und 2 kurze Tipps.` }],
                schema: S.obj({ prozent: S.int, niveau: S.enm("B1", "B2", "B2+", "C1", "C1+"), tipps: S.arr(S.str) }),
                maxTokens: 3000, effort: "low",
              });
              clear(el);
              const p = Math.max(0, Math.min(100, data.prozent)) / 100;
              return el.append(h("div.card", h("h3", `Schreiben: ca. ${data.niveau}`), h("ul", data.tipps.map((t) => h("li", t)))), h("button.btn.primary.wide", { onclick: () => resolve(p) }, "Weiter"));
            } catch (e) { toast(e.message); }
          }
          // Selbsteinschätzung
          clear(el);
          el.append(h("h3", "Wie sicher fühlst du dich beim Schreiben?"),
            h("div.options", [["Sehr unsicher", 0.3], ["Eher unsicher", 0.45], ["Ganz okay", 0.6], ["Sicher", 0.75]].map(([l, v]) => h("button.option", { onclick: () => resolve(v) }, l))));
        } }, "Abgeben")));
  });
}
