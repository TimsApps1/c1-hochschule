// Fehlerprotokoll: sammelt Fehler aus allen Modulen, gruppiert nach Fehlerart, erzeugt Wiederholungen.
// Ein Fehler gilt als behoben, wenn er 3× an verschiedenen Tagen richtig beantwortet wurde (1 → 3 → 6 Tage).
import { h, clear, md, shuffle } from "./ui.js";
import { store } from "./store.js";
import { runQuiz, resultScreen } from "./quiz.js";
import { KATEGORIEN } from "./content.js";
import { dueErrors, errorCategories } from "./analytics.js";

const DAY = 86400000;
const STEPS = [1, 3, 6];

export function errorToItem(e) {
  const base = { label: (KATEGORIEN[e.kategorie] || e.kategorie) + " · " + modulName(e.modul), explain: e.erklaerung || "" };
  if (e.optionen && e.optionen.length && e.loesung != null && e.loesung >= 0) {
    return { ...base, prompt: e.frage, options: e.optionen, correct: e.loesung };
  }
  if (e.typ === "input" || e.modul === "drill") {
    return { ...base, type: "input", prompt: e.frage + (e.gegeben && e.modul !== "drill" ? "" : ""), solution: e.richtig, accept: e.akzeptiert || [] };
  }
  return { ...base, type: "self", prompt: e.frage, solution: `**${e.richtig}**` };
}

function modulName(m) {
  return { sb: "Sprachbausteine", drill: "Grammatik", wortschatz: "Wortschatz", redewendungen: "Redewendungen", lesen: "Lesen", hoeren: "Hören", schreiben: "Schreiben", sprechen: "Sprechen" }[m] || m;
}

async function applyResult(e, ok) {
  const rec = { ...e };
  if (ok) {
    rec.stage = (rec.stage || 0) + 1;
    if (rec.stage >= STEPS.length) rec.resolved = true;
    else rec.due = Date.now() + STEPS[rec.stage] * DAY;
  } else {
    rec.stage = 0;
    rec.due = Date.now() + STEPS[0] * DAY;
    rec.count = (rec.count || 1) + 1;
  }
  await store.updateError(rec);
}

/** Wiederholungsrunde mit fälligen Fehlern (Schwerpunkt: häufige Fehlerarten). */
export async function errorReview(el, { n = 10, kategorie, embedded } = {}) {
  let list = dueErrors();
  if (kategorie) list = list.filter((e) => e.kategorie === kategorie);
  if (!list.length) {
    if (!embedded) clear(el).append(h("div.empty", "Keine fälligen Fehler – super! 🎉"));
    return { score: 0, max: 0, xp: 0, empty: true };
  }
  list = shuffle(list).sort((a, b) => (b.count || 1) - (a.count || 1)).slice(0, n);
  const items = list.map((e) => ({ ...errorToItem(e), onResult: (ok) => applyResult(e, ok) }));
  const res = await runQuiz(el, { title: "Fehlerwiederholung", items, retryWrong: false });
  const xp = res.score * 2 + 3;
  if (!res.aborted) await store.addAttempt({ modul: "fehler", score: res.score, max: res.max, sec: res.sec, xp, meta: { ohneWertung: true } });
  if (!embedded && !res.aborted) await resultScreen(el, { title: "Fehler bearbeitet", score: res.score, max: res.max, xp });
  return { ...res, xp };
}

/** Übersicht: Fehlerarten, offene Fehler, Liste. */
export function errorOverview(el, nav) {
  clear(el);
  const cats = errorCategories();
  const due = dueErrors().length;
  const open = [...store.errors.values()].filter((e) => !e.resolved);
  el.append(h("h1", "Fehlerprotokoll"),
    h("div.stat-row", h("div.stat", h("b", open.length), h("span", "offen")), h("div.stat", h("b", due), h("span", "heute fällig")), h("div.stat", h("b", store.errors.size - open.length), h("span", "behoben"))),
    due ? h("button.btn.primary.wide", { onclick: () => nav("#/fehler/wiederholen") }, `▶︎ ${Math.min(due, 10)} fällige Fehler wiederholen`) : h("p.muted", "Heute nichts fällig."));
  if (!cats.length) {
    el.append(h("div.empty", "Noch keine Fehler gesammelt. Sie landen hier automatisch aus allen Übungen."));
    return;
  }
  el.append(h("h2", "Häufigste Fehlerarten"));
  const maxG = Math.max(...cats.map((c) => c.gesamt));
  for (const c of cats) {
    const grammar = ["konnektoren", "praepositionen", "rektion", "nomen_verb", "passiv", "konjunktiv", "partizip", "relativsatz", "nominalisierung", "deklination", "pronomen", "wortstellung", "wortbildung"].includes(c.kategorie);
    el.append(h("div.cat-row",
      h("div.cat-name", KATEGORIEN[c.kategorie] || c.kategorie, h("span.muted.small", ` ${c.offen} offen · ${c.gesamt} gesamt`)),
      h("div.bar", h("span", { style: { width: (c.gesamt / maxG) * 100 + "%" } })),
      h("div.row",
        c.offen ? h("button.btn.small", { onclick: () => nav("#/fehler/wiederholen/" + c.kategorie) }, "Wiederholen") : null,
        grammar ? h("button.btn.small.ghost", { onclick: () => nav("#/drill/" + c.kategorie) }, "Drill + Erklärung") : null)));
  }
  el.append(h("h2", "Letzte Fehler"));
  const recent = [...store.errors.values()].sort((a, b) => b.t - a.t).slice(0, 40);
  for (const e of recent) {
    el.append(h("details.entry" + (e.resolved ? ".done" : ""),
      h("summary", h("span", (e.resolved ? "✓ " : "") + modulName(e.modul) + " · " + (KATEGORIEN[e.kategorie] || e.kategorie)), h("span.chip.soft", `${e.count || 1}×`)),
      h("div.small", { html: md(e.frage || "") }),
      e.gegeben ? h("p.small", h("span.muted", "Deine Antwort: "), h("s", e.gegeben)) : null,
      h("p.small", h("span.muted", "Richtig: "), h("strong", e.richtig || "")),
      e.erklaerung ? h("p.small", { html: md(e.erklaerung) }) : null));
  }
}
