// Leseverstehen Teil 1–3 im Originalformat.
import { h, clear, md, Timer, fmtTime, confirmBox, toast } from "./ui.js";
import { store } from "./store.js";
import { TEILE } from "./analytics.js";
import { taskHelpButton } from "./aufgaben.js";

const RFN = { richtig: "richtig", falsch: "falsch", nicht_im_text: "nicht im Text" };

export const LESE_TIPPS = {
  lv1: ["Lies zuerst den ganzen Text grob (2 Min.).", "Achte vor und nach jeder Lücke auf **Signale**: Pronomen (dies, diese, sie), Konnektoren (jedoch, daher), Wiederaufnahmen.", "Streiche benutzte Sätze. Zwei Sätze bleiben übrig – sie passen thematisch, aber nicht logisch."],
  lv2: ["Lies zuerst die 6 Aussagen und markiere das **Verb der Absicht** (warnt, kritisiert, empfiehlt …).", "Überfliege jeden Abschnitt: Was _tut_ der Autor hier – informieren, kritisieren, vorschlagen?", "Ein Abschnitt kann mehrmals oder gar nicht passen."],
  lv3: ["Die Aussagen folgen der **Reihenfolge des Textes**.", "**falsch** = Text sagt das Gegenteil (schon ein falsches Detail reicht). **nicht im Text** = Text sagt dazu nichts.", "Kein Weltwissen benutzen – nur, was im Text steht.", "Überschrift zum Schluss: Welche trifft den **ganzen** Text, nicht nur einen Absatz?"],
};

function shell(el, { title, sub, minutes, mode, teil }) {
  clear(el);
  const timerEl = h("span.timer");
  let timer = null;
  const api = { timer: null, onTimeUp: null };
  if (mode === "pruefung" && minutes) {
    timer = new Timer({ seconds: minutes * 60, mode: "down", onTick: (v) => { timerEl.textContent = "⏱ " + fmtTime(v); timerEl.classList.toggle("warn", v < 120); }, onEnd: () => { toast("Zeit ist um!"); api.onTimeUp && api.onTimeUp(); } });
    timer.start();
  } else {
    timer = new Timer({ mode: "up", onTick: (v) => (timerEl.textContent = "⏱ " + fmtTime(v)) });
    timer.start();
  }
  api.timer = timer;
  const close = h("button.icon-btn", { "aria-label": "Beenden" }, "✕");
  const head = h("div.ex-head", close, h("div", h("strong", title), h("div.muted.small", sub || "")), timerEl);
  const tabs = h("div.seg", h("button.on", { onclick: () => show("text") }, "📄 Text"), h("button", { onclick: () => show("aufg") }, "✏️ Aufgaben"));
  const textPane = h("div.pane.text-pane");
  const taskPane = h("div.pane.task-pane");
  const panes = h("div.panes", textPane, taskPane);
  const foot = h("div.ex-foot");
  function show(which) {
    tabs.children[0].classList.toggle("on", which === "text");
    tabs.children[1].classList.toggle("on", which === "aufg");
    panes.dataset.show = which;
  }
  panes.dataset.show = "text";
  const tips = LESE_TIPPS[teil];
  el.append(head, h("div.help-row", taskHelpButton(teil)), mode !== "pruefung" && tips ? h("details.tips", h("summary", "💡 Strategie"), h("ul", tips.map((t) => h("li", { html: md(t) })))) : null, tabs, panes, foot);
  return Object.assign(api, { close, textPane, taskPane, foot, show });
}

function paragraphs(text) {
  return String(text).split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}

async function finishAttempt({ item, teil, score, max, sec, mode, embedded }) {
  const xp = 10 + Math.round((score / max) * 20);
  if (!embedded?.noAttempt) await store.addAttempt({ modul: "lesen", teil, itemId: item.id, score, max, sec, xp, meta: { mode } });
  return xp;
}

/** @param {{mode?:"pruefung"|"uebung", embedded?:object}} opts */
export function lesenExam(el, item, opts = {}) {
  const teil = item.teil;
  if (teil === "lv1") return lv1(el, item, opts);
  if (teil === "lv2") return lv2(el, item, opts);
  return lv3(el, item, opts);
}

function lv1(el, item, opts) {
  return new Promise((resolve) => {
    const mode = opts.mode || "uebung";
    const S = shell(el, { title: TEILE.lv1.name, sub: item.titel, minutes: 15, mode, teil: "lv1" });
    const answers = {};
    let submitted = false;
    const gapBtns = {};
    for (const p of paragraphs(item.text)) {
      const para = h("p");
      for (const part of p.split(/(\[\d+\])/)) {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) { para.append(document.createTextNode(part)); continue; }
        const n = m[1];
        const b = h("button.gap", { onclick: () => pick(n) }, `(${n}) ……`);
        gapBtns[n] = b;
        para.append(b);
      }
      S.textPane.append(para);
    }
    const sentenceList = h("div.sentences", item.saetze.map((s) => h("div.sentence", { "data-b": s.b }, h("b", s.b + ") "), s.text)));
    S.textPane.append(h("h4", "Sätze a–h (zwei passen nicht)"), sentenceList);
    // Aufgaben-Tab: je Lücke Auswahl a–h
    const rows = {};
    for (const n of Object.keys(item.loesungen)) {
      const sel = h("div.letters", item.saetze.map((s) => h("button.letter", { onclick: () => set(n, s.b) }, s.b)));
      rows[n] = sel;
      S.taskPane.append(h("div.qrow", h("span.qnum", n), sel));
    }
    S.taskPane.append(h("div.sentences.small", item.saetze.map((s) => h("div.sentence", h("b", s.b + ") "), s.text))));
    function pick(n) {
      if (submitted) return explain(n);
      S.show("aufg");
      rows[n].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function set(n, b) {
      if (submitted) return explain(n);
      answers[n] = b;
      for (const x of rows[n].children) x.classList.toggle("sel", x.textContent === b);
      gapBtns[n].textContent = `(${n}) ${b}`;
      gapBtns[n].classList.add("filled");
      const used = Object.values(answers);
      sentenceList.querySelectorAll(".sentence").forEach((d) => d.classList.toggle("used", used.includes(d.dataset.b)));
    }
    function explain(n) {
      toast(`${n}: richtig ${item.loesungen[n]}`);
    }
    const submitBtn = h("button.btn.primary.wide", { onclick: () => submit() }, "Abgeben");
    S.foot.append(submitBtn);
    S.onTimeUp = () => submit(true);
    S.close.onclick = async () => { if (submitted || (await confirmBox("Abbrechen?", "Deine Antworten gehen verloren."))) { S.timer.stop(); resolve({ aborted: true }); } };
    async function submit(force) {
      if (submitted) return;
      const open = Object.keys(item.loesungen).filter((n) => !answers[n]).length;
      if (open && !force && !(await confirmBox("Abgeben?", `${open} Lücke(n) offen.`, "Abgeben", "Weiter"))) return;
      submitted = true;
      S.timer.stop();
      let right = 0;
      const exp = h("div.explanations");
      for (const [n, sol] of Object.entries(item.loesungen)) {
        const ok = answers[n] === sol;
        if (ok) right++;
        gapBtns[n].classList.add(ok ? "right" : "wrong");
        gapBtns[n].textContent = `(${n}) ${sol}`;
        for (const x of rows[n].children) x.classList.toggle("right", x.textContent === sol);
        const sentence = item.saetze.find((s) => s.b === sol)?.text;
        exp.append(h("div.exp" + (ok ? ".ok" : ".no"), h("strong", `${n}: ${sol}`), ok ? " ✓" : ` ✗ (du: ${answers[n] || "–"})`, h("div.small", "„" + sentence + "“"), h("div.small", { html: md(item.erklaerungen?.[n] || "") })));
        if (!ok) await store.addError({ modul: "lesen", kategorie: "leseverstehen", itemRef: `${item.id}#${n}`, frage: `Lesen 1 – Lücke ${n} in „${item.titel}“: Welcher Satz passt?`, richtig: `${sol}) ${sentence}`, gegeben: answers[n] || "–", erklaerung: item.erklaerungen?.[n] || "" });
      }
      if (item.distraktoren) exp.append(h("div.exp", h("strong", "Die übrigen Sätze: "), Object.entries(item.distraktoren).map(([b, t]) => h("div.small", `${b}) ${t}`))));
      const score = right * 2, max = 12;
      const sec = Math.round(S.timer.elapsed);
      const xp = await finishAttempt({ item, teil: "lv1", score, max, sec, mode, embedded: opts.embedded });
      S.taskPane.prepend(h("div.score-box", h("strong", `${score} / ${max} Punkte`), h("span.muted", ` (${right} von 6 richtig)`)), exp);
      S.show("aufg");
      clear(S.foot).append(h("button.btn.primary.wide", { onclick: () => resolve({ score, max, sec, xp }) }, "Weiter"));
    }
  });
}

function lv2(el, item, opts) {
  return new Promise((resolve) => {
    const mode = opts.mode || "uebung";
    const S = shell(el, { title: TEILE.lv2.name, sub: item.titel, minutes: 15, mode, teil: "lv2" });
    const answers = {};
    let submitted = false;
    S.textPane.append(h("h3", item.titel));
    for (const a of item.abschnitte) S.textPane.append(h("div.abschnitt", h("span.abs-b", a.b), h("p", a.text)));
    const rows = {};
    for (const q of item.aussagen) {
      const sel = h("div.letters", item.abschnitte.map((a) => h("button.letter", { onclick: () => set(q.nr, a.b) }, a.b)));
      rows[q.nr] = sel;
      S.taskPane.append(h("div.qblock", h("p", h("span.qnum", q.nr), " ", q.text), sel));
    }
    function set(nr, b) {
      if (submitted) return;
      answers[nr] = b;
      for (const x of rows[nr].children) x.classList.toggle("sel", x.textContent === b);
    }
    S.foot.append(h("button.btn.primary.wide", { onclick: () => submit() }, "Abgeben"));
    S.onTimeUp = () => submit(true);
    S.close.onclick = async () => { if (submitted || (await confirmBox("Abbrechen?", "Deine Antworten gehen verloren."))) { S.timer.stop(); resolve({ aborted: true }); } };
    async function submit(force) {
      if (submitted) return;
      const open = item.aussagen.filter((q) => !answers[q.nr]).length;
      if (open && !force && !(await confirmBox("Abgeben?", `${open} Aussage(n) offen.`, "Abgeben", "Weiter"))) return;
      submitted = true;
      S.timer.stop();
      let right = 0;
      for (const q of item.aussagen) {
        const ok = answers[q.nr] === q.loesung;
        if (ok) right++;
        for (const x of rows[q.nr].children) {
          x.classList.toggle("right", x.textContent === q.loesung);
          x.classList.toggle("wrong", !ok && x.textContent === answers[q.nr]);
        }
        rows[q.nr].after(h("div.exp" + (ok ? ".ok" : ".no"), h("strong", `Lösung: ${q.loesung}`), h("div.small", { html: md(q.erklaerung || "") })));
        if (!ok) await store.addError({ modul: "lesen", kategorie: "leseverstehen", itemRef: `${item.id}#${q.nr}`, frage: `Lesen 2 („${item.titel}“): ${q.text}`, richtig: `Abschnitt ${q.loesung}`, gegeben: answers[q.nr] || "–", erklaerung: q.erklaerung || "" });
      }
      const score = right * 2, max = 12;
      const sec = Math.round(S.timer.elapsed);
      const xp = await finishAttempt({ item, teil: "lv2", score, max, sec, mode, embedded: opts.embedded });
      S.taskPane.prepend(h("div.score-box", h("strong", `${score} / ${max} Punkte`), h("span.muted", ` (${right} von 6 richtig)`)));
      S.show("aufg");
      clear(S.foot).append(h("button.btn.primary.wide", { onclick: () => resolve({ score, max, sec, xp }) }, "Weiter"));
    }
  });
}

function lv3(el, item, opts) {
  return new Promise((resolve) => {
    const mode = opts.mode || "uebung";
    const S = shell(el, { title: TEILE.lv3.name, sub: item.titel, minutes: 35, mode, teil: "lv3" });
    const answers = {};
    let titleAns = null;
    let submitted = false;
    S.textPane.append(h("h3.muted", "[ Überschrift → Aufgabe 12 ]"));
    for (const p of paragraphs(item.text)) S.textPane.append(h("p", p));
    const rows = {};
    for (const q of item.aussagen) {
      const sel = h("div.tri", Object.entries(RFN).map(([k, label]) => h("button.letter.wide", { "data-k": k, onclick: () => set(q.nr, k) }, label)));
      rows[q.nr] = sel;
      S.taskPane.append(h("div.qblock", h("p", h("span.qnum", q.nr), " ", q.text), sel));
    }
    const tsel = h("div.options", item.ueberschrift.optionen.map((o, i) => h("button.option", { onclick: () => { if (submitted) return; titleAns = i; [...tsel.children].forEach((x, j) => x.classList.toggle("sel", j === i)); } }, `${"abc"[i]}) ${o}`)));
    S.taskPane.append(h("div.qblock", h("p", h("span.qnum", "12"), " Welche Überschrift passt am besten zum ganzen Text?"), tsel));
    function set(nr, k) {
      if (submitted) return;
      answers[nr] = k;
      for (const x of rows[nr].children) x.classList.toggle("sel", x.dataset.k === k);
    }
    S.foot.append(h("button.btn.primary.wide", { onclick: () => submit() }, "Abgeben"));
    S.onTimeUp = () => submit(true);
    S.close.onclick = async () => { if (submitted || (await confirmBox("Abbrechen?", "Deine Antworten gehen verloren."))) { S.timer.stop(); resolve({ aborted: true }); } };
    async function submit(force) {
      if (submitted) return;
      const open = item.aussagen.filter((q) => !answers[q.nr]).length + (titleAns == null ? 1 : 0);
      if (open && !force && !(await confirmBox("Abgeben?", `${open} Aufgabe(n) offen.`, "Abgeben", "Weiter"))) return;
      submitted = true;
      S.timer.stop();
      let right = 0;
      for (const q of item.aussagen) {
        const ok = answers[q.nr] === q.loesung;
        if (ok) right++;
        for (const x of rows[q.nr].children) {
          x.classList.toggle("right", x.dataset.k === q.loesung);
          x.classList.toggle("wrong", !ok && x.dataset.k === answers[q.nr]);
        }
        rows[q.nr].after(h("div.exp" + (ok ? ".ok" : ".no"), h("strong", RFN[q.loesung]), q.beleg ? h("div.small", "Text: „" + q.beleg + "“") : null, h("div.small", { html: md(q.erklaerung || "") })));
        if (!ok) await store.addError({ modul: "lesen", kategorie: "leseverstehen", itemRef: `${item.id}#${q.nr}`, frage: `Lesen 3 („${item.titel}“): ${q.text}`, optionen: ["richtig", "falsch", "nicht im Text"], loesung: ["richtig", "falsch", "nicht_im_text"].indexOf(q.loesung), richtig: RFN[q.loesung], gegeben: RFN[answers[q.nr]] || "–", erklaerung: (q.beleg ? `Text: „${q.beleg}“\n` : "") + (q.erklaerung || "") });
      }
      const tOk = titleAns === item.ueberschrift.loesung;
      if (tOk) right++;
      [...tsel.children].forEach((x, j) => { x.classList.toggle("right", j === item.ueberschrift.loesung); x.classList.toggle("wrong", !tOk && j === titleAns); });
      tsel.after(h("div.exp" + (tOk ? ".ok" : ".no"), h("div.small", { html: md(item.ueberschrift.erklaerung || "") })));
      const score = right * 2, max = 24;
      const sec = Math.round(S.timer.elapsed);
      const xp = await finishAttempt({ item, teil: "lv3", score, max, sec, mode, embedded: opts.embedded });
      S.taskPane.prepend(h("div.score-box", h("strong", `${score} / ${max} Punkte`), h("span.muted", ` (${right} von 12 richtig)`)));
      S.show("aufg");
      clear(S.foot).append(h("button.btn.primary.wide", { onclick: () => resolve({ score, max, sec, xp }) }, "Weiter"));
    }
  });
}
