// Schriftlicher Ausdruck: Erörterung/Stellungnahme (≥ 350 Wörter, 70 Min.), 1 von 2 Themen.
// KI-Bewertung nach den 4 telc-Kriterien (A/B/C/D = 12/8/4/0), markierte Fehler, verbesserte Version.
// Ohne KI: Musterlösung + Checkliste mit ehrlicher Selbsteinschätzung.
import { h, clear, md, esc, Timer, fmtTime, confirmBox, toast } from "./ui.js";
import { thinking } from "./mascot.js";
import { load } from "./content.js";
import { store } from "./store.js";
import { db } from "./db.js";
import { ai, S, AiUnavailable, learnerContext } from "./ai.js";
import { KATEGORIEN } from "./content.js";
import { taskHelpButton } from "./aufgaben.js";

const STUFE_PKT = { A: 12, B: 8, C: 4, D: 0 };
const KRIT = [
  ["aufgabengerechtheit", "Aufgabengerechtheit", "Inhalt vollständig, beide Zitate, eigener Standpunkt, roter Faden, Textsorte/Register, Einleitung–Hauptteil–Schluss"],
  ["korrektheit", "Korrektheit", "Grammatik, Rechtschreibung, Zeichensetzung"],
  ["repertoire", "Repertoire", "Wortschatz und Strukturen: breit, präzise, komplex, keine Umgangssprache"],
  ["kommunikative_gestaltung", "Kommunikative Gestaltung", "Absätze, Konnektoren, Verweise, Kohäsion und Kohärenz"],
];
const FEHLER_KAT = ["konnektoren", "praepositionen", "rektion", "nomen_verb", "passiv", "konjunktiv", "partizip", "relativsatz", "nominalisierung", "deklination", "pronomen", "wortstellung", "verbformen", "wortbildung", "wortschatz", "kollokation", "rechtschreibung", "register", "struktur", "inhalt"];

const BAUKASTEN_FUNKTIONEN = [
  ["einleiten", "Einleitung"], ["meinung", "Meinung"], ["argumentieren", "Argument"], ["gegenargument", "Gegenargument"],
  ["beispiel_geben", "Beispiel"], ["vergleichen", "Vergleich"], ["bewerten", "Bewerten"], ["strukturieren", "Überleitung"],
  ["zusammenfassen", "Zusammenfassen"], ["schluss", "Schluss"],
];

export function wordCount(t) {
  return (String(t).trim().match(/\S+/g) || []).length;
}

function taskBox(t) {
  return h("div.task-box",
    h("div.chip", t.textsorte || "Erörterung"),
    h("p", t.situation),
    t.zitate.map((z) => h("blockquote", "„" + z.text + "“", h("cite", z.person))),
    h("p", h("strong", t.anweisung)),
    h("p.muted.small", "Mindestens 350 Wörter · Einleitung – Hauptteil – Schluss"),
    h("div.help-row", taskHelpButton("sa", t.id)));
}

async function baukasten(onInsert) {
  const rw = await load("redewendungen");
  const rm = rw.filter((r) => r.typ === "redemittel" && r.pruefung !== "sprechen" && r.pruefung !== "vermeiden");
  const wrap = h("details.baukasten", h("summary", "🧰 Redemittel-Baukasten"));
  const tabs = h("div.chips");
  const list = h("div.rm-list");
  const show = (f) => {
    clear(list);
    [...tabs.children].forEach((c) => c.classList.toggle("on", c.dataset.f === f));
    for (const r of rm.filter((x) => x.funktion === f)) list.append(h("button.rm", { onclick: () => onInsert(r.ausdruck) }, r.ausdruck));
    if (!list.children.length) list.append(h("p.muted.small", "Noch keine Redemittel geladen."));
  };
  for (const [f, label] of BAUKASTEN_FUNKTIONEN) tabs.append(h("button.chip", { "data-f": f, onclick: () => show(f) }, label));
  wrap.append(tabs, list);
  show("einleiten");
  return wrap;
}

/**
 * Schreibaufgabe bearbeiten.
 * @param {object[]} tasks 1 Aufgabe (Übung) oder 2 (Prüfung: Auswahl)
 * @param {{mode:"pruefung"|"uebung", minutes?:number}} opts
 */
export function schreibenTask(el, tasks, opts = {}) {
  return new Promise(async (resolve) => {
    const mode = opts.mode || "uebung";
    let task = tasks.length === 1 ? tasks[0] : null;
    clear(el);
    if (!task) {
      el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve({ aborted: true }) }, "✕"), h("strong", "Schriftlicher Ausdruck – Thema wählen")),
        h("p.muted", "Wie in der Prüfung: Wähle eines der beiden Themen. Nimm dir 2–3 Minuten für die Entscheidung."));
      tasks.forEach((t, i) => el.append(h("div.card", taskBox(t), h("button.btn.primary.wide", { onclick: () => { task = t; start(); } }, `Thema ${i + 1} wählen`))));
    } else start();

    async function start() {
      clear(el);
      const draftKey = "draft." + task.id;
      const ta = h("textarea.writing", { placeholder: "Schreibe hier deinen Text … (Absätze mit Leerzeile)", spellcheck: false, autocorrect: "off", autocapitalize: "sentences" });
      ta.value = (await db.kvGet(draftKey, "")) || "";
      const wc = h("span.wc");
      const timerEl = h("span.timer");
      const updateWc = () => {
        const n = wordCount(ta.value);
        wc.textContent = `${n} Wörter`;
        wc.classList.toggle("ok", n >= 350);
      };
      let saveT = null;
      ta.addEventListener("input", () => { updateWc(); clearTimeout(saveT); saveT = setTimeout(() => db.kvSet(draftKey, ta.value), 600); });
      updateWc();
      const timer = mode === "pruefung"
        ? new Timer({ seconds: (opts.minutes || 70) * 60, mode: "down", onTick: (v) => { timerEl.textContent = "⏱ " + fmtTime(v); timerEl.classList.toggle("warn", v < 600); }, onEnd: () => { toast("Zeit ist um – bitte abgeben."); ta.readOnly = true; } })
        : new Timer({ mode: "up", onTick: (v) => (timerEl.textContent = "⏱ " + fmtTime(v)) });
      timer.start();
      const insert = (txt) => {
        const s = ta.selectionStart ?? ta.value.length;
        const before = ta.value.slice(0, s);
        const sep = before && !/\s$/.test(before) ? " " : "";
        ta.value = before + sep + txt + " " + ta.value.slice(ta.selectionEnd ?? s);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + sep.length + txt.length + 1;
        ta.dispatchEvent(new Event("input"));
      };
      const close = h("button.icon-btn", { onclick: async () => { if (await confirmBox("Pause?", "Dein Entwurf bleibt gespeichert.", "Verlassen", "Weiterschreiben")) { timer.stop(); resolve({ aborted: true }); } } }, "✕");
      el.append(h("div.ex-head", close, h("div", h("strong", "Schreiben"), h("div.muted.small", mode === "pruefung" ? "Prüfungsmodus · 70 Minuten" : "Übungsmodus")), timerEl),
        h("details.task-details" + (mode === "pruefung" ? "" : ""), { open: true }, h("summary", "Aufgabe"), taskBox(task)));
      if (mode !== "pruefung") {
        el.append(h("details.tips", h("summary", "💡 Ideen & Gliederung"),
          h("div.two", h("div", h("strong", "Pro"), h("ul", (task.ideen_pro || []).map((x) => h("li", x)))), h("div", h("strong", "Contra"), h("ul", (task.ideen_contra || []).map((x) => h("li", x))))),
          h("strong", "Mögliche Gliederung"), h("ol", (task.gliederung || []).map((x) => h("li", x))),
          h("p.small.muted", "Zeitplan Prüfung: 10 Min. planen · 50 Min. schreiben · 10 Min. Korrektur lesen.")));
        el.append(await baukasten(insert));
      }
      el.append(ta, h("div.ex-foot", wc, h("button.btn.primary", { onclick: () => submit() }, "Abgeben")));

      async function submit() {
        const text = ta.value.trim();
        const n = wordCount(text);
        if (n < 30) return toast("Bitte erst einen Text schreiben.");
        if (n < 350 && !(await confirmBox("Abgeben?", `Dein Text hat ${n} Wörter. In der Prüfung sind mindestens 350 verlangt.`, "Trotzdem abgeben", "Weiterschreiben"))) return;
        timer.stop();
        const sec = Math.round(timer.elapsed);
        const rec = await store.saveText({ typ: "schreiben", aufgabeId: task.id, text, woerter: n, sec, mode });
        await db.kvDel(draftKey);
        const res = await evaluate(el, task, rec);
        resolve(res);
      }
    }
  });
}

const SYSTEM_SCHREIBEN = () => `Du bist eine erfahrene, lizenzierte telc-Bewerterin für „telc Deutsch C1 Hochschule“ und gleichzeitig eine warmherzige Lehrerin.
Bewerte den Prüfungstext (Erörterung/Stellungnahme, mind. 350 Wörter) streng nach den vier telc-Kriterien. Stufen: A = C1 in jeder Hinsicht erreicht (12 P.), B = vorwiegend erreicht (8 P.), C = vorwiegend nicht erreicht (4 P.), D = überhaupt nicht erreicht (0 P.).
1 Aufgabengerechtheit: inhaltliche Vorgaben voll abgedeckt (beide Aussagen/Zitate aufgegriffen, eigener Standpunkt argumentativ dargelegt, Beispiele), roter Faden, kritische Auseinandersetzung, Textsorte/Adressat/Situation passend, Einleitung–Hauptteil–Schluss, ausführlich genug.
2 Korrektheit: Morphologie, Syntax, Orthographie, Zeichensetzung; A = (fast) fehlerfrei, Fehler höchstens in komplexen Strukturen; C = mehrere Fehler auch in einfachen Strukturen. Durchgängige Groß- oder Kleinschreibung kostet eine Stufe.
3 Repertoire: breiter, präziser, komplexer Wortschatz und Strukturen; Wiederholungen, Umgangssprache, Unpräzision führen zu Abzug.
4 Kommunikative Gestaltung: Gliederung auch auf Absatzebene, Kohäsion und Kohärenz (Konnektoren, Pronominaladverbien, Verweise, Substitution).
Thema verfehlt → alles D.
Bewerte ehrlich – lieber eine Stufe zu streng als zu gut; die Lernerin will die echte Prüfung bestehen.
${learnerContext()} Schreibe ALLE Rückmeldungen auf Deutsch, einfach und klar (B2-Erklärsprache), freundlich und konkret.
Fehlerliste: die wichtigsten 8–20 Fehler; "zitat" muss EXAKT (zeichengenau) im Text vorkommen und kurz sein (2–8 Wörter); "korrektur" ist die korrigierte Stelle; "kategorie" aus der Liste; "erklaerung" ein kurzer Satz.
"verbesserte_version": der vollständige Text auf sicherem C1-Niveau überarbeitet, Inhalt und Aufbau der Lernerin beibehalten.`;

async function evaluate(el, task, rec) {
  clear(el);
  el.append(thinking(h("p", "Dein Text wird bewertet …"), h("p.muted.small", "Das dauert meist 30–90 Sekunden.")));
  let fb = null, err = null;
  const av = await ai.available();
  if (av.ok) {
    try {
      const { data, usd } = await ai.call({
        system: SYSTEM_SCHREIBEN(),
        messages: [{ role: "user", content: `AUFGABE\nSituation: ${task.situation}\nZitat 1: „${task.zitate[0].text}“ (${task.zitate[0].person})\nZitat 2: „${task.zitate[1].text}“ (${task.zitate[1].person})\nArbeitsanweisung: ${task.anweisung}\n\nTEXT DER LERNERIN (${rec.woerter} Wörter):\n"""\n${rec.text}\n"""` }],
        schema: S.obj({
          kriterien: S.obj(Object.fromEntries(KRIT.map(([k]) => [k, S.obj({ stufe: S.enm("A", "B", "C", "D"), begruendung: S.str })]))),
          staerken: S.arr(S.str),
          verbesserungen: S.arr(S.str),
          fehler: S.arr(S.obj({ zitat: S.str, korrektur: S.str, kategorie: S.enm(...FEHLER_KAT), erklaerung: S.str })),
          verbesserte_version: S.str,
        }),
        maxTokens: 20000,
      });
      fb = { ...data, quelle: "ki", usd };
    } catch (e) {
      err = e instanceof AiUnavailable ? e.message : "KI-Bewertung fehlgeschlagen.";
    }
  } else err = av.msg;

  if (fb) {
    fb.punkte = KRIT.reduce((s, [k]) => s + (STUFE_PKT[fb.kriterien[k]?.stufe] ?? 0), 0);
    rec.feedback = fb;
    await store.saveText(rec);
    for (const f of fb.fehler) {
      await store.addError({ modul: "schreiben", kategorie: f.kategorie, itemRef: `${rec.id}#${f.zitat}`, frage: `Korrigiere die Stelle aus deinem Text:\n„${f.zitat}“`, richtig: f.korrektur, gegeben: f.zitat, erklaerung: f.erklaerung, typ: "input" });
    }
    const xp = 40;
    await store.addAttempt({ modul: "schreiben", teil: "sa", itemId: task.id, score: fb.punkte, max: 48, sec: rec.sec, xp, meta: { mode: rec.mode, ki: true, textId: rec.id } });
    return showFeedback(el, task, rec, fb, xp);
  }
  // Ohne KI: Musterlösung + Checkliste
  return selfAssess(el, task, rec, err);
}

export function highlight(text, fehler) {
  let html = esc(text);
  const used = new Set();
  for (const [i, f] of (fehler || []).entries()) {
    const z = esc(f.zitat);
    if (!z || used.has(z)) continue;
    const pos = html.indexOf(z);
    if (pos < 0) continue;
    used.add(z);
    html = html.slice(0, pos) + `<mark data-i="${i}">${z}</mark>` + html.slice(pos + z.length);
  }
  return html.replace(/\n/g, "<br>");
}

export function showFeedback(el, task, rec, fb, xp) {
  return new Promise((resolve) => {
    clear(el);
    const pts = fb.punkte;
    const tip = h("div.mark-tip.hidden");
    const textBox = h("div.marked-text", { html: highlight(rec.text, fb.fehler) });
    textBox.addEventListener("click", (e) => {
      const m = e.target.closest("mark");
      if (!m) return;
      const f = fb.fehler[+m.dataset.i];
      clear(tip).classList.remove("hidden");
      tip.append(h("strong", "„" + f.zitat + "“ → „" + f.korrektur + "“"), h("div.small", (KATEGORIEN[f.kategorie] || f.kategorie) + ": " + f.erklaerung));
    });
    el.append(
      h("div.ex-head", h("span"), h("strong", "Bewertung"), h("span")),
      h("div.score-big", h("div", `${pts} / 48`), h("div.muted.small", `≈ ${Math.round((pts / 48) * 100)} % · Orientierung: 60 % ≈ 29 P.`), xp ? h("div.xp-pill", `+${xp} XP`) : null),
      h("div.krit", KRIT.map(([k, name]) => {
        const c = fb.kriterien[k];
        return h("div.krit-row", h("span.stufe.s" + c.stufe, c.stufe), h("div", h("strong", name + ` (${STUFE_PKT[c.stufe]} P.)`), h("div.small", c.begruendung)));
      })),
      fb.staerken?.length ? h("div.card.ok", h("strong", "👍 Das gelingt dir schon"), h("ul", fb.staerken.map((s) => h("li", s)))) : null,
      fb.verbesserungen?.length ? h("div.card", h("strong", "🎯 Daran arbeiten"), h("ul", fb.verbesserungen.map((s) => h("li", s)))) : null,
      h("h3", `Dein Text – ${fb.fehler.length} markierte Fehler (antippen)`), tip, textBox,
      h("details", h("summary", "✨ Verbesserte Version"), h("div.model-text", { html: md(fb.verbesserte_version) })),
      task.musterloesung ? h("details", h("summary", "📄 Musterlösung"), h("div.model-text", { html: md(task.musterloesung) })) : null,
      fb.usd != null ? h("p.muted.small", `Kosten dieser Bewertung: ca. ${fb.usd.toFixed(3)} $ · Die Fehler stehen jetzt im Fehlerprotokoll.`) : null,
      h("button.btn.primary.wide", { onclick: () => resolve({ score: pts, max: 48, xp }) }, "Weiter"));
  });
}

function selfAssess(el, task, rec, reason) {
  return new Promise((resolve) => {
    clear(el);
    const checks = (task.checkliste || []).map((c) => h("label.check", h("input", { type: "checkbox" }), h("span", c)));
    const sel = {};
    const kritRows = KRIT.map(([k, name, desc]) => h("div.krit-row", h("div", h("strong", name), h("div.small.muted", desc)),
      h("div.letters", ["A", "B", "C", "D"].map((s) => h("button.letter", { onclick: (e) => { sel[k] = s; [...e.target.parentNode.children].forEach((b) => b.classList.toggle("sel", b === e.target)); } }, s)))));
    el.append(
      h("div.ex-head", h("span"), h("strong", "Selbstkontrolle"), h("span")),
      reason ? h("p.callout", reason) : null,
      h("p", { html: md("Vergleiche deinen Text mit der Musterlösung und gehe die Checkliste durch. Schätze dich dann **ehrlich** ein – lieber etwas strenger.") }),
      h("details", h("summary", "Dein Text"), h("div.model-text", { html: md(rec.text) })),
      h("details", h("summary", "📄 Musterlösung"), h("div.model-text", { html: md(task.musterloesung || "") })),
      h("h3", "Checkliste"), h("div.checks", checks),
      h("h3", "Einschätzung nach telc-Kriterien"), h("p.small.muted", "A = sicher C1 · B = meistens · C = eher nicht · D = gar nicht"), kritRows,
      h("button.btn.primary.wide", { onclick: async () => {
        if (Object.keys(sel).length < 4) return toast("Bitte alle 4 Kriterien einschätzen.");
        const pts = KRIT.reduce((s, [k]) => s + STUFE_PKT[sel[k]], 0);
        rec.feedback = { quelle: "selbst", stufen: sel, punkte: pts, checkliste: checks.map((c) => c.querySelector("input").checked) };
        await store.saveText(rec);
        const xp = 30;
        await store.addAttempt({ modul: "schreiben", teil: "sa", itemId: task.id, score: pts, max: 48, sec: rec.sec, xp, meta: { mode: rec.mode, selbst: true, textId: rec.id } });
        resolve({ score: pts, max: 48, xp });
      } }, "Speichern"));
  });
}

export async function writingTasks() {
  return load("schreiben");
}
