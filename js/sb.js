// Sprachbausteine (22 Lücken, je 4 Optionen) im Prüfungsformat + Grammatik-Drills + Kurzerklärungen.
import { h, clear, md, Timer, fmtTime, confirmBox, toast } from "./ui.js";
import { emptyBox } from "./mascot.js";
import { load, KATEGORIEN } from "./content.js";
import { store } from "./store.js";
import { runQuiz, resultScreen } from "./quiz.js";

const LETTERS = ["a", "b", "c", "d"];

/** Satz rund um Lücke n (andere Lücken mit Lösung gefüllt) – für das Fehlerprotokoll. */
export function gapSentence(set, n) {
  let t = set.text;
  for (const g of set.luecken) if (g.nr !== n) t = t.replace(`{${g.nr}}`, g.optionen[g.loesung]);
  t = t.replace(`{${n}}`, "_____");
  const sentences = t.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => s.includes("_____")) || t;
}

/**
 * Prüfungsformat-Player.
 * @param {{mode:"pruefung"|"uebung", minutes?:number, embedded?:boolean, onlyFirst?:number}} opts
 */
export function sbExam(el, set, opts = {}) {
  return new Promise((resolve) => {
    const mode = opts.mode || "uebung";
    const gaps = opts.onlyFirst ? set.luecken.slice(0, opts.onlyFirst) : set.luecken;
    const answers = new Map();
    let submitted = false;
    const started = Date.now();
    clear(el);

    const timerEl = h("span.timer", "");
    let timer = null;
    if (mode === "pruefung" && opts.minutes) {
      timer = new Timer({ seconds: opts.minutes * 60, mode: "down", onTick: (v) => { timerEl.textContent = "⏱ " + fmtTime(v); timerEl.classList.toggle("warn", v < 180); }, onEnd: () => { toast("Zeit ist um!"); submit(); } });
      timer.start();
    }
    const counter = h("span.muted.small");
    const head = h("div.ex-head",
      h("button.icon-btn", { "aria-label": "Zurück", onclick: async () => { if (submitted || (await confirmBox("Abbrechen?", "Dein Fortschritt in diesem Set geht verloren."))) { timer?.stop(); resolve({ aborted: true }); } } }, "✕"),
      h("div", h("strong", "Sprachbausteine"), h("div.muted.small", set.titel + (set.textsorte ? " · " + set.textsorte : ""))),
      timerEl);
    const textBox = h("div.sb-text");
    const sheet = h("div.sheet.hidden");
    const footer = h("div.ex-foot", counter);
    el.append(head, h("p.muted.small", mode === "pruefung" ? "Prüfungsmodus: Wähle für jede Lücke a–d. Auswertung erst am Ende." : "Übungsmodus: Du siehst sofort, ob es stimmt – mit Begründung."), textBox, footer, sheet);

    // Text mit Lücken-Buttons aufbauen
    const parts = set.text.split(/(\{\d+\})/);
    const gapBtns = new Map();
    const shown = new Set(gaps.map((g) => g.nr));
    for (const p of parts) {
      const m = p.match(/^\{(\d+)\}$/);
      if (!m) { textBox.append(document.createTextNode(p)); continue; }
      const nr = +m[1];
      const g = set.luecken.find((x) => x.nr === nr);
      if (!shown.has(nr)) { textBox.append(h("span.gap.filled", g.optionen[g.loesung])); continue; }
      const b = h("button.gap", { onclick: () => openSheet(g) }, `(${nr}) ……`);
      gapBtns.set(nr, b);
      textBox.append(b);
    }
    const updateCounter = () => { counter.textContent = `${answers.size}/${gaps.length} beantwortet`; };
    updateCounter();
    const submitBtn = h("button.btn.primary", { onclick: () => submit() }, mode === "pruefung" ? "Abgeben" : "Fertig");
    footer.append(submitBtn);

    function openSheet(g) {
      if (submitted && !answers.has(g.nr) && mode === "pruefung") return explain(g);
      if (submitted || (mode === "uebung" && answers.has(g.nr))) return explain(g);
      clear(sheet).classList.remove("hidden");
      sheet.append(h("div.sheet-head", h("strong", `Lücke ${g.nr}`), h("button.icon-btn", { onclick: () => sheet.classList.add("hidden") }, "✕")),
        h("p.small.muted", gapSentence(set, g.nr)),
        h("div.options", g.optionen.map((o, i) => h("button.option" + (answers.get(g.nr) === i ? ".sel" : ""), { onclick: () => choose(g, i) }, h("b", LETTERS[i] + ") "), o))));
    }
    function choose(g, i) {
      answers.set(g.nr, i);
      const b = gapBtns.get(g.nr);
      b.textContent = `(${g.nr}) ${g.optionen[i]}`;
      b.classList.add("filled");
      updateCounter();
      if (mode === "uebung") {
        const ok = i === g.loesung;
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) logError(g, i);
        explain(g);
      } else {
        sheet.classList.add("hidden");
        // nächste offene Lücke
        const nextGap = gaps.find((x) => !answers.has(x.nr));
        if (nextGap) setTimeout(() => openSheet(nextGap), 120);
      }
    }
    function explain(g) {
      const a = answers.get(g.nr);
      clear(sheet).classList.remove("hidden");
      const ok = a === g.loesung;
      sheet.append(h("div.sheet-head", h("strong", `Lücke ${g.nr} · ${KATEGORIEN[g.kategorie] || g.kategorie}`), h("button.icon-btn", { onclick: () => sheet.classList.add("hidden") }, "✕")),
        h("div.feedback" + (ok ? ".ok" : ".no"),
          h("div.fb-title", a == null ? "Nicht beantwortet" : ok ? "✓ Richtig" : `✗ Du: ${g.optionen[a]}`),
          h("div.fb-sol", h("span.muted", "Lösung: "), h("strong", `${LETTERS[g.loesung]}) ${g.optionen[g.loesung]}`)),
          h("div.fb-exp", { html: md(g.erklaerung) })),
        mode === "uebung" && !submitted ? h("button.btn.wide", { onclick: () => { const n = gaps.find((x) => !answers.has(x.nr)); n ? openSheet(n) : sheet.classList.add("hidden"); } }, "Nächste Lücke") : null);
    }
    async function logError(g, i) {
      await store.addError({
        modul: "sb", kategorie: g.kategorie || "wortschatz", itemRef: `${set.id}#${g.nr}`,
        frage: gapSentence(set, g.nr), optionen: g.optionen, loesung: g.loesung, richtig: g.optionen[g.loesung], gegeben: g.optionen[i], erklaerung: g.erklaerung,
      });
    }
    async function submit() {
      if (submitted) return;
      const open = gaps.length - answers.size;
      if (open > 0 && !(timer && !timer.running) && !(await confirmBox("Abgeben?", `${open} Lücke(n) sind noch offen.`, "Abgeben", "Weiter bearbeiten"))) return;
      submitted = true;
      timer?.stop();
      let score = 0;
      for (const g of gaps) {
        const a = answers.get(g.nr);
        const b = gapBtns.get(g.nr);
        if (a === g.loesung) { score++; b.classList.add("right"); }
        else {
          b.classList.add("wrong");
          if (a == null) b.textContent = `(${g.nr}) –`;
          if (mode === "pruefung") await logError(g, a ?? 0);
        }
      }
      sheet.classList.add("hidden");
      const sec = Math.round((Date.now() - started) / 1000);
      const max = gaps.length;
      const xp = 10 + score;
      if (!opts.noAttempt) await store.addAttempt({ modul: "sb", teil: "sb", itemId: set.id, score, max, sec, xp, meta: { mode } });
      clear(footer).append(h("div.score-line", h("strong", `${score} / ${max} richtig`), h("span.muted", " · Tippe auf eine Lücke für die Begründung")),
        h("button.btn.primary", { onclick: () => resolve({ score, max, sec, xp, answers }) }, "Weiter"));
      el.scrollTo?.({ top: 0, behavior: "smooth" });
    }
  });
}

/** Grammatik-Drill-Runde (eine Kategorie oder gemischt). */
export async function drillRound(el, kategorie, n = 10, opts = {}) {
  const drills = await load("drills");
  let list = kategorie ? drills.filter((d) => d.kategorie === kategorie) : drills;
  if (!list.length) {
    clear(el).append(emptyBox("Die Drills werden noch erstellt."));
    return { aborted: true };
  }
  // Schwerpunkt: zuletzt falsch beantwortete zuerst, sonst zufällig
  const wrongIds = new Set([...store.errors.values()].filter((e) => e.modul === "drill" && !e.resolved).map((e) => e.itemRef));
  list = [...list].sort((a, b) => (wrongIds.has(b.id) - wrongIds.has(a.id)) || Math.random() - 0.5).slice(0, n);
  const items = list.map((d) => {
    const isInput = d.typ === "umformung";
    const it = isInput
      ? { label: KATEGORIEN[d.kategorie], type: "input", prompt: `${d.aufgabe}\n\n_${d.ausgang}_\n\n${d.vorgabe || ""}`, solution: d.loesung, accept: d.akzeptiert || [], explain: d.erklaerung }
      : { label: KATEGORIEN[d.kategorie], prompt: d.satz.replace("___", "_____"), options: d.optionen, correct: d.loesung, explain: d.erklaerung };
    if (d.beispiel) it.explain += "\n\n💡 Noch ein Beispiel: " + d.beispiel;
    it.onResult = async (ok, given) => {
      if (!ok) await store.addError({ modul: "drill", kategorie: d.kategorie, itemRef: d.id, frage: isInput ? `${d.aufgabe}\n\n_${d.ausgang}_\n\n${d.vorgabe || ""}` : d.satz.replace("___", "_____"), optionen: isInput ? null : d.optionen, loesung: isInput ? null : d.loesung, richtig: isInput ? d.loesung : d.optionen[d.loesung], akzeptiert: d.akzeptiert, gegeben: given, erklaerung: d.erklaerung });
    };
    return it;
  });
  const res = await runQuiz(el, { title: kategorie ? KATEGORIEN[kategorie] : "Grammatik gemischt", items });
  const xp = res.score + 5;
  if (!res.aborted) await store.addAttempt({ modul: "drill", teil: kategorie || "mix", score: res.score, max: res.max, sec: res.sec, xp });
  if (!opts.embedded && !res.aborted) await resultScreen(el, { score: res.score, max: res.max, xp });
  return { ...res, xp };
}

export async function grammarCard(id) {
  const all = await load("grammatik");
  const g = all.find((x) => x.id === id);
  if (!g) return h("p.muted", "Erklärung folgt.");
  return h("div.grammar",
    h("h3", g.titel),
    h("div", { html: md(g.kurz) }),
    g.tabelle?.length ? h("div.table-wrap", h("table", g.tabelle.map((row, i) => h("tr", row.map((c) => h(i === 0 ? "th" : "td", c)))))) : null,
    g.uebersicht?.length ? h("div.callout", h("strong", "Merksätze"), h("ul", g.uebersicht.map((b) => h("li", { html: md(b) })))) : null,
    g.beispiele?.length ? h("details.beispiele", { open: true }, h("summary", `Beispiele (${g.beispiele.length})`), h("ul", g.beispiele.map((b) => h("li", { html: md(b) })))) : null,
    g.falle ? h("p.callout", "⚠️ " + g.falle) : null);
}

export function sbStats() {
  const done = new Set(store.attempts.filter((a) => a.modul === "sb").map((a) => a.itemId));
  return done;
}
