// „💬 Frag Tarsi“: KI-Fragen zu genau dem, was gerade auf dem Bildschirm gelernt wird.
// - Kontext = sichtbarer Inhalt der aktuellen Übung (Aufgabe, Text, Optionen, Feedback) + Ort in der App.
// - Vor dem Beantworten: Tipps statt Lösung (außer ausdrücklich gewünscht). Im Prüfungsmodus erst nach der Abgabe.
// - Verlauf pro Bildschirm; jede Frage/Antwort wird unter „Meine Fragen“ gespeichert (synchronisiert).
import { h, clear, md, toast } from "./ui.js";
import { store } from "./store.js";
import { ai, AiUnavailable, learnerContext } from "./ai.js";
import { mascot } from "./mascot.js";

let sheet = null;
let history = [];
let contextKey = "";

/** Prüfungsmodus-Kennzeichen setzen (von Lesen/Hören/SB/Schreiben/Generalprobe). */
export function setExamMode(on) {
  if (on) document.body.dataset.exam = "1";
  else delete document.body.dataset.exam;
}

function answeredNow() {
  return !!document.querySelector("#main .feedback, #main .score-box, #main .exp, #main .result, #main .score-big, #main .score-line");
}

/** Liest, was gerade zu sehen ist (ohne Navigation, Knöpfe-Leisten und Tarsi-Sprüche). */
export function captureContext() {
  const main = document.getElementById("main");
  const clone = main.cloneNode(true);
  clone.querySelectorAll("header.topbar, .quiz-head .bar, .tabbar, .mascot, button.icon-btn, audio, .progress-strip, .ask-fab").forEach((x) => x.remove());
  // Gewählte/markierte Antworten kenntlich machen
  clone.querySelectorAll(".option.sel, .letter.sel").forEach((x) => (x.textContent = "[gewählt] " + x.textContent));
  clone.querySelectorAll(".option.right, .letter.right").forEach((x) => (x.textContent = "[richtig] " + x.textContent));
  clone.querySelectorAll(".option.wrong, .letter.wrong").forEach((x) => (x.textContent = "[falsch gewählt] " + x.textContent));
  // Antwortoptionen als Liste kennzeichnen
  clone.querySelectorAll(".option, .letter, .rm, .chip").forEach((x) => (x.textContent = "• " + x.textContent.trim()));
  const ta = main.querySelector("textarea");
  // innerText braucht Layout → Kopie kurz unsichtbar einhängen
  const holder = h("div", { style: { position: "fixed", left: "-10000px", top: "0", width: "375px" } }, clone);
  document.body.append(holder);
  let text = (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  holder.remove();
  if (ta && ta.value.trim()) text += `\n\n[Eigener Text der Lernerin im Eingabefeld]:\n${ta.value.trim()}`;
  if (text.length > 7000) text = text.slice(0, 7000) + "\n[… gekürzt]";
  const title = [...main.querySelectorAll(".ex-head strong, .ex-head .muted, .quiz-title, h1")].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 3).join(" · ");
  return { title: title || "Startseite", route: location.hash || "#/", text, answered: answeredNow(), exam: document.body.dataset.exam === "1" };
}

const SYSTEM = () => `Du bist Tarsi, die freundliche, kluge Lernhelferin in einer App zur Vorbereitung auf „telc Deutsch C1 Hochschule“ (Prüfung am 12.12.2026). ${learnerContext()}
Die Lernerin stellt dir eine Frage zu dem, was sie GERADE auf dem Bildschirm sieht (der Bildschirminhalt steht in der ersten Nachricht).
So antwortest du:
- Auf Deutsch, einfach und klar (B1/B2-Erklärsprache, kurze Sätze), freundlich und ermutigend. Schwierige Wörter erklärst du mit einfachen Wörtern oder Synonymen – keine englischen Übersetzungen.
- Konkret zum Bildschirminhalt: zitiere die betroffene Stelle kurz.
- Grammatik: Regel in 1–2 Sätzen + 2 kurze Beispiele. Wortschatz: Bedeutung, Synonym, Beispielsatz. Aufgabenstellung: sag in einfachen Worten, was zu tun ist.
- Wenn die Aufgabe noch NICHT beantwortet ist: Verrate die Lösung nicht. Gib einen hilfreichen Tipp oder erkläre, worauf sie achten muss – außer sie fragt ausdrücklich nach der Lösung. Wenn die Aufgabe beantwortet ist: Erkläre ausführlich, warum die Lösung richtig ist und warum ihre Antwort (falls falsch) nicht passt.
- Normalerweise max. 150 Wörter; mehr nur, wenn sie darum bittet. Formatierung: **fett** für Schlüsselwörter, kurze Listen mit „- “; keine Tabellen, keine Überschriften.
- Wenn etwas im Bildschirminhalt fehlt, sag ehrlich, was du nicht sehen kannst.`;

function suggestions(ctx) {
  const base = ctx.answered
    ? ["Warum ist das richtig?", "Warum war meine Antwort falsch?", "Noch ein Beispiel bitte", "Erklär es einfacher"]
    : ["Gib mir einen Tipp", "Was muss ich hier tun?", "Erklär mir ein Wort", "Welche Grammatik ist das?"];
  return base;
}

export function openAsk() {
  const ctx = captureContext();
  const key = ctx.route + "|" + ctx.title + "|" + ctx.text.slice(0, 200);
  if (key !== contextKey) { history = []; contextKey = key; }
  if (sheet) sheet.remove();
  const log = h("div.ask-log");
  const input = h("textarea.answer", { rows: 2, placeholder: "Deine Frage … (🎤 Diktat geht auch)" });
  const sendBtn = h("button.btn.primary", { onclick: () => send(input.value) }, "Senden");
  const chips = h("div.chips", suggestions(ctx).map((s) => h("button.chip", { onclick: () => send(s) }, s)));
  const close = () => { sheet?.remove(); sheet = null; };
  sheet = h("div.ask-wrap", { onclick: (e) => { if (e.target === sheet) close(); } },
    h("div.ask-sheet",
      h("div.ask-head", mascot("think", 44), h("div", h("strong", "Frag Tarsi"), h("div.small.muted", ctx.title)), h("button.icon-btn", { onclick: close, "aria-label": "Schließen" }, "✕")),
      log, chips, h("div.ask-input", input, sendBtn)));
  document.body.append(sheet);
  // Verlauf anzeigen
  if (!history.length) log.append(h("div.bubble.partner", h("p", ctx.exam && !ctx.answered ? "Du bist im Prüfungsmodus – wie in der echten Prüfung helfe ich dir erst nach der Abgabe. Danach erkläre ich dir alles gern! 😊" : "Hallo! Was möchtest du zu dieser Aufgabe wissen? Ich sehe, was gerade auf deinem Bildschirm steht.")));
  for (const m of history) log.append(bubble(m.role, m.content, m.shown));
  setTimeout(() => input.focus(), 100);
  log.scrollTop = log.scrollHeight;

  async function send(q) {
    q = String(q || "").trim();
    if (!q) return;
    if (ctx.exam && !answeredNow()) return toast("Im Prüfungsmodus erst nach der Abgabe – wie in der echten Prüfung.");
    const av = await ai.available();
    if (!av.ok) {
      log.append(bubble("user", q, q), h("div.bubble.partner", h("p", av.reason === "nokey" ? "Für Fragen an Tarsi braucht die App einen API-Key (Mehr → KI-Feedback). Bis dahin: Tippe auf „❓ Was muss ich tun?“ oder lies die Erklärung unter der Aufgabe." : av.msg)));
      return;
    }
    input.value = "";
    const fresh = captureContext(); // aktueller Stand (z. B. inzwischen beantwortet)
    const userContent = history.length
      ? q
      : `BILDSCHIRMINHALT (Ort: ${fresh.title}; Aufgabe beantwortet: ${fresh.answered ? "ja" : "nein"}):\n"""\n${fresh.text}\n"""\n\nFRAGE DER LERNERIN: ${q}`;
    history.push({ role: "user", content: userContent, shown: q });
    log.append(bubble("user", q, q));
    const wait = h("div.bubble.partner.typing", h("p", "Tarsi denkt nach …"));
    log.append(wait);
    log.scrollTop = log.scrollHeight;
    sendBtn.disabled = true;
    try {
      const { text, usd } = await ai.call({ system: SYSTEM(), messages: history.map((m) => ({ role: m.role, content: m.content })), maxTokens: 4000, effort: "low" });
      wait.remove();
      history.push({ role: "assistant", content: text, shown: text });
      log.append(bubble("assistant", text, text));
      await store.saveText({ typ: "frage", frage: q, antwort: text, kontext: fresh.title, route: fresh.route, usd });
    } catch (e) {
      wait.remove();
      history.pop();
      log.append(h("div.bubble.partner", h("p", e instanceof AiUnavailable ? e.message : "Das hat leider nicht geklappt. Bitte noch einmal versuchen.")));
    } finally {
      sendBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }
}

function bubble(role, content, shown) {
  return role === "user" ? h("div.bubble.me", h("p", shown || content)) : h("div.bubble.partner", h("div", { html: md(shown || content) }));
}

/** Schwebender Knopf – immer verfügbar. */
export function askFab() {
  return h("button.ask-fab", { "aria-label": "Frag Tarsi", onclick: () => openAsk() }, h("span", "💬"), h("span.ask-fab-lbl", "Frag Tarsi"));
}

/** Liste gespeicherter Fragen (Mehr → Meine Fragen). */
export function questionsList() {
  const qs = [...store.texts.values()].filter((t) => t.typ === "frage").sort((a, b) => b.t - a.t).slice(0, 40);
  if (!qs.length) return h("p.small.muted", "Noch keine Fragen gestellt. Tippe in einer Übung auf „💬 Frag Tarsi“.");
  return h("div.list", qs.map((q) => h("details.entry", h("summary", h("span", q.frage.slice(0, 70) + (q.frage.length > 70 ? "…" : "")), h("span.chip.soft", new Date(q.t).toLocaleDateString("de-DE"))),
    h("p.small.muted", q.kontext || ""), h("div", { html: md(q.antwort || "") }))));
}
