// Mündlicher Ausdruck: 1A Präsentation (20 Min. Vorbereitung, 3–4 Min. Vortrag), 1B Zusammenfassung/Anschlussfragen,
// Teil 2 Diskussion mit KI-Partnerin (vertritt Gegenpositionen). Eingabe per iOS-Diktat ins Textfeld,
// zusätzlich Aufnahme zum Selbst-Anhören. Ohne KI: Mustervortrag, Fragen per Sprachausgabe, Beispieldialog.
import { h, clear, md, Timer, fmtTime, confirmBox, toast } from "./ui.js";
import { store } from "./store.js";
import { ai, S, AiUnavailable, learnerContext } from "./ai.js";
import { Recorder, recorderSupported } from "./recorder.js";
import { speakOnce, stopAll } from "./tts.js";
import { load } from "./content.js";

const SYS_BASE_TAIL = ` Sie spricht per Diktat – Satzzeichen, Groß-/Kleinschreibung und einzelne Wörter können durch die Spracherkennung verfälscht sein; bewerte solche Fehler NICHT als Grammatikfehler. Alles auf Deutsch.`;
const sysBase = () => learnerContext() + SYS_BASE_TAIL;

const MUENDLICH_KRIT = `telc-Kriterien mündlich: Aufgabengerechtheit je Teil (1A: 6/4/2/0, 1B: 4/2/1/0, Teil 2: 6/4/2/0); für die ganze Prüfung: Flüssigkeit, Repertoire, Grammatische Richtigkeit, Aussprache/Intonation je 8/5/2/0. Aussprache kannst du aus Text NICHT beurteilen.`;

/** Diktat-Feld + optionale Aufnahme. */
function speakInput({ placeholder = "Tippe aufs Feld und dann auf 🎤 (Diktieren) in der Tastatur …", rows = 6 } = {}) {
  const ta = h("textarea.answer", { rows, placeholder });
  const rec = new Recorder();
  const audio = h("audio", { controls: true, class: "hidden" });
  const recTime = h("span.small.muted");
  let iv = null;
  const recBtn = h("button.btn.small", { onclick: async () => {
    try {
      if (rec.recording) {
        clearInterval(iv);
        const url = await rec.stop();
        audio.src = url;
        audio.classList.remove("hidden");
        recBtn.textContent = "⏺ Neu aufnehmen";
        recTime.textContent = "";
      } else {
        await rec.start();
        recBtn.textContent = "⏹ Aufnahme stoppen";
        iv = setInterval(() => (recTime.textContent = "● " + fmtTime(rec.seconds)), 500);
      }
    } catch (e) {
      toast("Mikrofon nicht verfügbar: " + e.message);
    }
  } }, "⏺ Aufnehmen");
  const el = h("div.speak-input", ta, recorderSupported() ? h("div.row", recBtn, recTime) : null, audio,
    h("p.small.muted", "Tipp: Erst mit „Aufnehmen“ sprechen und anhören – oder per Diktat sprechen, damit die KI den Text auswerten kann. Beides gleichzeitig klappt auf dem iPhone oft nicht."));
  return { el, ta, stopRec: async () => { if (rec.recording) { clearInterval(iv); await rec.stop(); } } };
}

// ---------------- Teil 1A + 1B ----------------
export function praesentation(el, blatt, opts = {}) {
  return new Promise((resolve) => {
    clear(el);
    let thema = null;
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => { stopAll(); resolve({ aborted: true }); } }, "✕"), h("strong", "Teil 1A – Präsentation"), h("span")),
      h("p.muted", "Wie in der Prüfung: Wähle eines der beiden Themen. Dann hast du 20 Minuten Vorbereitung (Notizen erlaubt, aber nicht ablesen)."));
    blatt.themen.forEach((t, i) => el.append(h("div.card", h("h3", t.titel), h("p", t.aufgabe), h("ul", t.leitpunkte.map((l) => h("li", l))), h("button.btn.primary.wide", { onclick: () => { thema = t; prep(); } }, `Thema ${i + 1} wählen`))));

    function prep() {
      clear(el);
      const notes = h("textarea.answer", { rows: 8, placeholder: "Deine Stichpunkte (nur Stichworte!) …" });
      const timerEl = h("div.big-timer");
      const timer = new Timer({ seconds: (opts.prepMinutes ?? 20) * 60, mode: "down" });
      timer.onTick = (v) => (timerEl.textContent = fmtTime(v));
      timer.onEnd = () => { toast("Vorbereitungszeit vorbei!"); };
      timer.start();
      el.append(h("div.ex-head", h("button.icon-btn", { onclick: async () => { if (await confirmBox("Abbrechen?", "")) { timer.stop(); resolve({ aborted: true }); } } }, "✕"), h("strong", "Vorbereitung"), h("span")),
        timerEl,
        h("div.task-box", h("h3", thema.titel), h("p", thema.aufgabe), h("ul", thema.leitpunkte.map((l) => h("li", l)))),
        h("details.tips", h("summary", "💡 Aufbau einer guten Präsentation"), h("ol",
          h("li", "Einleitung: Thema nennen, Gliederung ankündigen („Ich möchte zunächst …, danach …, abschließend …“)."),
          h("li", "Jeden Leitpunkt ansprechen – mit Beispiel (gern aus den Philippinen oder deinem Biologieunterricht)."),
          h("li", "Eigene Meinung begründen."),
          h("li", "Schluss: kurz zusammenfassen, Ausblick, „Vielen Dank für Ihre Aufmerksamkeit.“"),
          h("li", "Ziel: 3–4 Minuten, frei sprechen, Blickkontakt."))),
        h("details", h("summary", "📝 Muster-Notizzettel"), h("ul", (thema.stichpunkte || []).map((s) => h("li", s)))),
        notes,
        h("button.btn.primary.wide", { onclick: () => { timer.stop(); present(notes.value); } }, "Ich bin bereit – Präsentation starten"));
    }

    function present(notes) {
      clear(el);
      const timerEl = h("div.big-timer", "0:00");
      const timer = new Timer({ mode: "up", onTick: (v) => { timerEl.textContent = fmtTime(v); timerEl.classList.toggle("ok", v >= 180 && v <= 240); timerEl.classList.toggle("warn", v > 260); } });
      const inp = speakInput({ placeholder: "Sprich deine Präsentation per Diktat (🎤 in der Tastatur) – oder nimm sie auf." });
      const startBtn = h("button.btn.primary.wide", { onclick: () => { timer.start(); startBtn.remove(); } }, "▶︎ Sprechzeit starten");
      el.append(h("div.ex-head", h("span"), h("strong", "Präsentation (Ziel: 3–4 Min.)"), h("span")),
        timerEl, startBtn,
        notes ? h("details", h("summary", "Deine Notizen"), h("pre.notes", notes)) : null,
        inp.el,
        h("button.btn.good.wide", { onclick: async () => { timer.stop(); await inp.stopRec(); followUp(inp.ta.value.trim(), Math.round(timer.elapsed), notes); } }, "Fertig – weiter zu 1B"));
    }

    async function followUp(text, sec, notes) {
      clear(el);
      el.append(h("div.center", h("div.spinner"), h("p", "Die Prüferin hört zu und bereitet ihre Rückfrage vor …")));
      let fragen = null, zusammenfassung = null, kiOk = false;
      if (text.split(/\s+/).length > 40 && (await ai.available()).ok) {
        try {
          const { data } = await ai.call({
            system: sysBase() + " Du spielst die Gesprächspartnerin in Teil 1B: Du fasst die Präsentation in 2–3 Sätzen zusammen und stellst eine natürliche, inhaltliche Anschlussfrage (gesprochenes C1-Deutsch).",
            messages: [{ role: "user", content: `Thema: ${thema.titel}\nAufgabe: ${thema.aufgabe}\nPräsentation (Diktat):\n"""${text}"""` }],
            schema: S.obj({ zusammenfassung: S.str, frage: S.str }),
            maxTokens: 3000, effort: "low",
          });
          zusammenfassung = data.zusammenfassung;
          fragen = [data.frage];
          kiOk = true;
        } catch (e) { /* Fallback unten */ }
      }
      if (!fragen) fragen = [(thema.anschlussfragen || ["Was ist für Sie der wichtigste Punkt?"])[Math.floor(Math.random() * (thema.anschlussfragen?.length || 1))]];
      clear(el);
      const ask = (zusammenfassung ? zusammenfassung + " " : "") + fragen[0];
      const inp = speakInput({ rows: 4, placeholder: "Antworte per Diktat (ca. 1 Minute) …" });
      el.append(h("div.ex-head", h("span"), h("strong", "Teil 1B – Anschlussfrage"), h("span")),
        h("div.bubble.partner", h("div.small.muted", "Partnerin"), zusammenfassung ? h("p", zusammenfassung) : null, h("p", h("strong", fragen[0])), h("button.btn.small.ghost", { onclick: () => speakOnce(ask, "B") }, "🔊 Anhören")),
        inp.el,
        h("button.btn.primary.wide", { onclick: async () => { await inp.stopRec(); feedback(text, sec, inp.ta.value.trim(), ask); } }, "Antwort abschicken"));
      speakOnce(ask, "B");
    }

    async function feedback(text, sec, answer, ask) {
      stopAll();
      clear(el);
      const zeit = `Sprechzeit: ${fmtTime(sec)} (Ziel 3–4 Min.)`;
      const av = await ai.available();
      if (text.split(/\s+/).length > 40 && av.ok) {
        el.append(h("div.center", h("div.spinner"), h("p", "Feedback wird erstellt …")));
        try {
          const { data, usd } = await ai.call({
            system: sysBase() + "\nDu bist eine erfahrene telc-Prüferin und freundliche Lehrerin. " + MUENDLICH_KRIT + " Bewerte ehrlich (lieber etwas streng). Erklärsprache einfach (B2).",
            messages: [{ role: "user", content: `Teil 1A Präsentation – Thema: ${thema.titel}\nAufgabe: ${thema.aufgabe}\nLeitpunkte: ${thema.leitpunkte.join("; ")}\n${zeit}\nPräsentation (Diktat):\n"""${text}"""\n\nTeil 1B – Frage der Partnerin: ${ask}\nAntwort (Diktat):\n"""${answer || "(keine Antwort)"}"""` }],
            schema: feedbackSchema(["teil1a", "teil1b"]),
            maxTokens: 12000,
          });
          return showSpeakFeedback(el, data, { parts: { teil1a: 6, teil1b: 4 }, usd, sec, modulTeil: "1a", itemId: blatt.id, resolve, extra: thema.muster });
        } catch (e) {
          toast(e instanceof AiUnavailable ? e.message : "KI-Feedback nicht möglich");
        }
      }
      // ohne KI
      clear(el);
      el.append(h("div.ex-head", h("span"), h("strong", "Selbstkontrolle"), h("span")),
        h("p.callout", av.ok ? "Für KI-Feedback bitte per Diktat sprechen (mind. 40 Wörter)." : av.msg),
        h("p", zeit),
        h("details", { open: true }, h("summary", "📄 Mustervortrag"), h("div.model-text", { html: md(thema.muster || "") })),
        h("h3", "Checkliste"),
        h("div.checks", ["Einleitung mit Gliederung", "Alle Leitpunkte angesprochen", "Beispiele gegeben", "Eigene Meinung begründet", "Schluss mit Zusammenfassung", "3–4 Minuten frei gesprochen", "Frage aus 1B direkt beantwortet"].map((c) => h("label.check", h("input", { type: "checkbox" }), h("span", c)))),
        h("button.btn.primary.wide", { onclick: async () => {
          const n = el.querySelectorAll(".checks input:checked").length;
          const pts = Math.round((n / 7) * 10);
          await store.addAttempt({ modul: "sprechen", teil: "1a", itemId: blatt.id, score: pts, max: 10, sec, xp: 25, meta: { selbst: true } });
          resolve({ score: pts, max: 10, xp: 25 });
        } }, "Speichern"));
    }
  });
}

function feedbackSchema(parts) {
  return S.obj({
    aufgabengerechtheit: S.obj(Object.fromEntries(parts.map((p) => [p, S.obj({ punkte: S.int, begruendung: S.str })]))),
    fluessigkeit: S.obj({ punkte: S.int, begruendung: S.str }),
    repertoire: S.obj({ punkte: S.int, begruendung: S.str }),
    grammatik: S.obj({ punkte: S.int, begruendung: S.str }),
    struktur: S.str,
    interaktion: S.str,
    staerken: S.arr(S.str),
    tipps: S.arr(S.str),
    fehler: S.arr(S.obj({ zitat: S.str, korrektur: S.str, kategorie: S.str, erklaerung: S.str })),
    bessere_formulierungen: S.arr(S.obj({ statt: S.str, besser: S.str })),
  });
}

async function showSpeakFeedback(el, d, { parts, usd, sec, modulTeil, itemId, resolve, extra }) {
  clear(el);
  // Punkte begrenzen auf telc-Skalen
  const cap = (v, max) => Math.max(0, Math.min(max, Math.round(v || 0)));
  let got = 0, max = 0;
  const rows = [];
  for (const [p, pmax] of Object.entries(parts)) {
    const a = d.aufgabengerechtheit[p];
    const v = cap(a?.punkte, pmax);
    got += v; max += pmax;
    rows.push(h("div.krit-row", h("span.stufe", `${v}/${pmax}`), h("div", h("strong", { teil1a: "Aufgabengerechtheit 1A", teil1b: "Aufgabengerechtheit 1B", teil2: "Aufgabengerechtheit Teil 2" }[p]), h("div.small", a?.begruendung || ""))));
  }
  for (const [k, name] of [["fluessigkeit", "Flüssigkeit"], ["repertoire", "Repertoire"], ["grammatik", "Grammatik"]]) {
    const v = cap(d[k]?.punkte, 8);
    got += v; max += 8;
    rows.push(h("div.krit-row", h("span.stufe", `${v}/8`), h("div", h("strong", name), h("div.small", d[k]?.begruendung || ""))));
  }
  rows.push(h("div.krit-row", h("span.stufe", "–"), h("div", h("strong", "Aussprache"), h("div.small", "Aus Text nicht bewertbar – hör dir deine Aufnahme an."))));
  for (const f of d.fehler || []) await store.addError({ modul: "sprechen", kategorie: f.kategorie || "wortschatz", itemRef: `${itemId}#${f.zitat}`, frage: `Aus deinem Gespräch – korrigiere:\n„${f.zitat}“`, richtig: f.korrektur, gegeben: f.zitat, erklaerung: f.erklaerung, typ: "input" });
  const xp = 30;
  await store.addAttempt({ modul: "sprechen", teil: modulTeil, itemId, score: got, max, sec, xp, meta: { ki: true } });
  el.append(h("div.ex-head", h("span"), h("strong", "Feedback"), h("span")),
    h("div.score-big", h("div", `${got} / ${max}`), h("div.muted.small", `≈ ${Math.round((got / max) * 100)} % (ohne Aussprache) · Bestehen ≈ 60 %`), h("div.xp-pill", `+${xp} XP`)),
    h("div.krit", rows),
    d.struktur ? h("div.card", h("strong", "🧱 Struktur"), h("p", d.struktur)) : null,
    d.interaktion ? h("div.card", h("strong", "🤝 Interaktion"), h("p", d.interaktion)) : null,
    d.staerken?.length ? h("div.card.ok", h("strong", "👍 Stark"), h("ul", d.staerken.map((s) => h("li", s)))) : null,
    d.tipps?.length ? h("div.card", h("strong", "🎯 Tipps"), h("ul", d.tipps.map((s) => h("li", s)))) : null,
    d.bessere_formulierungen?.length ? h("div.card", h("strong", "💬 Besser formuliert"), h("ul", d.bessere_formulierungen.map((b) => h("li", h("s", b.statt), " → ", h("strong", b.besser))))) : null,
    d.fehler?.length ? h("div.card", h("strong", "✏️ Fehler (im Fehlerprotokoll)"), h("ul", d.fehler.map((f) => h("li", `„${f.zitat}“ → „${f.korrektur}“ – ${f.erklaerung}`)))) : null,
    extra ? h("details", h("summary", "📄 Muster"), h("div.model-text", { html: md(extra) })) : null,
    usd != null ? h("p.small.muted", `Kosten: ca. ${usd.toFixed(3)} $`) : null,
    h("button.btn.primary.wide", { onclick: () => resolve({ score: got, max, xp }) }, "Weiter"));
}

// ---------------- Teil 2: Diskussion ----------------
export function diskussion(el, d, opts = {}) {
  return new Promise(async (resolve) => {
    clear(el);
    const av = await ai.available();
    const turns = [];
    const maxTurns = opts.turns || 5;
    const start = Date.now();
    const chat = h("div.chat");
    const inp = speakInput({ rows: 3, placeholder: "Deine Antwort per Diktat (🎤) …" });
    const sendBtn = h("button.btn.primary.wide", { onclick: () => send() }, "Senden");
    const endBtn = h("button.btn.wide", { onclick: () => finish() }, "Diskussion beenden & Feedback");
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: async () => { if (await confirmBox("Abbrechen?", "")) { stopAll(); resolve({ aborted: true }); } } }, "✕"), h("strong", "Teil 2 – Diskussion"), h("span")),
      h("div.task-box", h("blockquote", "„" + d.zitat + "“", h("cite", d.person)), h("ul", d.leitpunkte.map((l) => h("li", l)))),
      h("details.tips", h("summary", "💡 Redemittel"), await redemittelList(["zustimmen", "widersprechen", "kompromiss", "nachfragen", "zeit_gewinnen", "meinung"])),
      !av.ok ? h("p.callout", av.msg + " Ohne KI liest die Partnerin vorbereitete Gegenargumente vor.") : null,
      chat, inp.el, sendBtn, endBtn);
    const partnerSay = (text) => {
      chat.append(h("div.bubble.partner", h("div.small.muted", "Partnerin"), h("p", text), h("button.btn.small.ghost", { onclick: () => speakOnce(text, "B") }, "🔊")));
      speakOnce(text, "B");
      chat.lastChild.scrollIntoView({ behavior: "smooth", block: "end" });
    };
    const scripted = [...(d.contra || []), ...(d.pro || [])];
    const system = sysBase() + `\nDu bist die Gesprächspartnerin der Lernerin in Teil 2 der mündlichen Prüfung (Diskussion, ca. 6 Minuten). Thema/Zitat: „${d.zitat}“ (${d.person}). Leitpunkte: ${d.leitpunkte.join("; ")}.
Verhalte dich wie eine gute Prüfungspartnerin auf C1-Niveau: Vertritt eher die GEGENPOSITION zur Lernerin, bringe konkrete Argumente und Beispiele, frage nach, widersprich höflich, aber gib ihr genug Raum (deine Beiträge: 2–4 Sätze, gesprochene Sprache). Gegen Ende darfst du einen Kompromiss vorschlagen. Korrigiere sie NICHT während des Gesprächs.`;

    // Eröffnung
    if (av.ok) {
      try {
        const { data } = await ai.call({ system, messages: [{ role: "user", content: "Eröffne die Diskussion mit einer kurzen Einschätzung des Zitats und einer Frage an mich." }], schema: S.obj({ beitrag: S.str }), maxTokens: 2000, effort: "low" });
        turns.push({ role: "user", content: "Eröffne die Diskussion mit einer kurzen Einschätzung des Zitats und einer Frage an mich." }, { role: "assistant", content: JSON.stringify(data) });
        partnerSay(data.beitrag);
      } catch (e) { toast(e.message); partnerSay(`Was halten Sie von dieser Aussage? Ich persönlich sehe das eher kritisch: ${scripted[0] || ""}`); }
    } else partnerSay(`Was halten Sie von dieser Aussage? Ich sehe das eher kritisch. ${scripted.shift() || ""}`);

    let userCount = 0;
    async function send() {
      const text = inp.ta.value.trim();
      if (!text) return toast("Bitte erst antworten (Diktat 🎤).");
      inp.ta.value = "";
      userCount++;
      chat.append(h("div.bubble.me", h("p", text)));
      turns.push({ role: "user", content: text });
      if (userCount >= maxTurns) return finish();
      sendBtn.disabled = true;
      if (av.ok) {
        try {
          const { data } = await ai.call({ system, messages: turns, schema: S.obj({ beitrag: S.str }), maxTokens: 2000, effort: "low" });
          turns.push({ role: "assistant", content: JSON.stringify(data) });
          partnerSay(data.beitrag);
        } catch (e) { toast(e.message); partnerSay(scripted.shift() || "Können Sie das noch genauer erklären?"); }
      } else partnerSay(scripted.shift() ? "Da muss ich widersprechen: " + scripted.shift() : "Und wie sähe für Sie ein Kompromiss aus?");
      sendBtn.disabled = false;
    }

    async function finish() {
      stopAll();
      await inp.stopRec();
      const sec = Math.round((Date.now() - start) / 1000);
      const mine = turns.filter((t) => t.role === "user").slice(av.ok ? 1 : 0).map((t) => t.content);
      const transcript = chat.innerText;
      if (av.ok && mine.join(" ").split(/\s+/).length > 30) {
        clear(el).append(h("div.center", h("div.spinner"), h("p", "Feedback wird erstellt …")));
        try {
          const { data, usd } = await ai.call({
            system: sysBase() + "\nDu bist eine erfahrene telc-Prüferin und freundliche Lehrerin. " + MUENDLICH_KRIT + " Bewerte NUR die Beiträge der Lernerin (nicht die der Partnerin), ehrlich. Bewerte auch die Interaktion (auf Argumente eingehen, nachfragen, widersprechen, Kompromiss).",
            messages: [{ role: "user", content: `Diskussion – Zitat: „${d.zitat}“\nVerlauf:\n${transcript}` }],
            schema: feedbackSchema(["teil2"]),
            maxTokens: 12000,
          });
          return showSpeakFeedback(el, data, { parts: { teil2: 6 }, usd, sec, modulTeil: "2", itemId: d.id, resolve, extra: (d.beispieldialog || []).map((t) => `**${t.sp}:** ${t.text}`).join("\n\n") });
        } catch (e) { toast(e.message); }
      }
      clear(el);
      el.append(h("div.ex-head", h("span"), h("strong", "Selbstkontrolle"), h("span")),
        h("div.two", h("div.card", h("strong", "Pro"), h("ul", (d.pro || []).map((x) => h("li", x)))), h("div.card", h("strong", "Contra"), h("ul", (d.contra || []).map((x) => h("li", x))))),
        h("div.card", h("strong", "Kompromiss"), h("ul", (d.kompromiss || []).map((x) => h("li", x)))),
        h("details", h("summary", "🎭 Beispieldialog"), (d.beispieldialog || []).map((t) => h("p", h("strong", t.sp + ": "), t.text))),
        h("div.checks", ["Eigene Meinung klar gesagt", "Auf Argumente der Partnerin eingegangen", "Höflich widersprochen", "Nachgefragt", "Beispiele gebracht", "Kompromiss gesucht"].map((c) => h("label.check", h("input", { type: "checkbox" }), h("span", c)))),
        h("button.btn.primary.wide", { onclick: async () => {
          const n = el.querySelectorAll(".checks input:checked").length;
          await store.addAttempt({ modul: "sprechen", teil: "2", itemId: d.id, score: n, max: 6, sec, xp: 25, meta: { selbst: true } });
          resolve({ score: n, max: 6, xp: 25 });
        } }, "Speichern"));
    }
  });
}

async function redemittelList(funktionen) {
  const rw = await load("redewendungen");
  const wrap = h("div");
  const names = { zustimmen: "Zustimmen", widersprechen: "Widersprechen", kompromiss: "Kompromiss", nachfragen: "Nachfragen", zeit_gewinnen: "Zeit gewinnen", meinung: "Meinung", einleiten: "Einleiten", strukturieren: "Strukturieren", schluss: "Schluss", beispiel_geben: "Beispiel" };
  for (const f of funktionen) {
    const items = rw.filter((r) => r.funktion === f && r.pruefung !== "vermeiden" && r.pruefung !== "schreiben");
    if (items.length) wrap.append(h("div.small", h("strong", names[f] + ": "), items.map((r) => r.ausdruck).join(" · ")));
  }
  if (!wrap.children.length) wrap.append(h("p.small.muted", "Redemittel werden noch geladen."));
  return wrap;
}

export { redemittelList };
