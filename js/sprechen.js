// Mündlicher Ausdruck: 1A Präsentation (Vorbereitung, 3–4 Min. Vortrag), 1B in beiden Rollen
// (eigene Anschlussfrage beantworten + fremden Kurzvortrag zusammenfassen und nachfragen),
// Teil 2 Diskussion mit KI-Partnerin (6-Min.-Uhr, die während der KI-Antwort anhält).
// Eingabe: „Aufnehmen, dann umwandeln“ (speakbox.js: Aufnahme → Azure-Texterkennung; Rückfall Diktat).
// Ohne KI: Mustervortrag, Fragen per Sprachausgabe, Beispieldialog, Checkliste.
import { h, clear, md, Timer, fmtTime, confirmBox, toast } from "./ui.js";
import { thinking, tarsiSays } from "./mascot.js";
import { store } from "./store.js";
import { ai, S, AiUnavailable, learnerContext } from "./ai.js";
import { speakOnce, stopAll, playUrl } from "./tts.js";
import { load } from "./content.js";
import { audioFor } from "./audio.js";
import { taskHelpButton } from "./aufgaben.js";
import { speakBox, azureHint } from "./speakbox.js";
import { fluencyNote } from "./azure.js";
import { keepRecording, getRecording } from "./recorder.js";

const SYS_BASE_TAIL = ` Ihr Text stammt aus automatischer Spracherkennung oder Diktat – Satzzeichen, Groß-/Kleinschreibung, Füllwörter und einzelne Wörter können verfälscht sein; bewerte solche Abweichungen NICHT als Grammatikfehler. Alles auf Deutsch.`;
const sysBase = () => learnerContext() + SYS_BASE_TAIL;

const MUENDLICH_KRIT = `telc-Kriterien mündlich: Aufgabengerechtheit je Teil (1A: 6/4/2/0, 1B: 4/2/1/0, Teil 2: 6/4/2/0); für die ganze Prüfung: Flüssigkeit, Repertoire, Grammatische Richtigkeit, Aussprache/Intonation je 8/5/2/0. Aussprache kannst du aus Text NICHT beurteilen. Gewichte Struktur, Aufgabenerfüllung und Flüssigkeit höher als einzelne Grammatikfehler; nenne nur die wichtigsten Fehler (max. 4).`;

const zeitInfo = (box) => box?.result ? `Sprechzeit ${fmtTime(Math.round(box.result.seconds))}; Zeitwerte: ${fluencyNote(box.result.stats) || "–"}` : "";

// ---------------- Teil 1A + 1B ----------------
/**
 * opts: prepMinutes, themaIndex (Thema vorgewählt), geruest (Gerüste aus sprechen_training.json → Spickzettel),
 *       zuhoeren (ID eines Kurzvortrags → 1B-Rolle „Zuhörende“ im Anschluss)
 */
export function praesentation(el, blatt, opts = {}) {
  return new Promise((resolve) => {
    clear(el);
    let thema = null, themaId = null;
    const finish = async (r) => {
      if (r && !r.aborted && opts.zuhoeren) await zuhoeren(el, opts.zuhoeren);
      resolve({ ...r, themaId });
    };
    const waehle = (t, i) => { thema = t; themaId = `${blatt.id}-${i}`; prep(); };
    if (opts.themaIndex != null && blatt.themen[opts.themaIndex]) return waehle(blatt.themen[opts.themaIndex], opts.themaIndex);
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => { stopAll(); resolve({ aborted: true }); } }, "✕"), h("strong", "Teil 1A – Präsentation"), h("span")),
      h("p.muted", `Wie in der Prüfung: Wähle eines der beiden Themen. Dann hast du ${opts.prepMinutes ?? 20} Minuten Vorbereitung (Notizen erlaubt, aber nicht ablesen).`),
      h("p.small", "💡 Nimm das Thema, zu dem du ein persönliches Beispiel hast (Beruf, Herkunftsland, Alltag)."));
    blatt.themen.forEach((t, i) => el.append(h("div.card", h("h3", t.titel), h("p", t.aufgabe), h("ul", t.leitpunkte.map((l) => h("li", l))), h("div.help-row", taskHelpButton("mp1a", `${blatt.id}-${i}`)), h("button.btn.primary.wide", { onclick: () => waehle(t, i) }, `Thema ${i + 1} wählen`))));

    function geruestKarte(open) {
      const g = opts.geruest?.[themaId];
      if (!g) return null;
      return h("details.tips", { open }, h("summary", "🧱 Dein Gerüst (Spickzettel)"),
        h("ol", g.abschnitte.map((a) => h("li", h("strong", a.titel), ` (~${a.ziel_s} s)`, h("div.small.muted", (a.satzanfaenge || [])[0] || "")))));
    }

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
        h("details.tips", { open: true }, h("summary", "⏱️ So nutzt du die Vorbereitungszeit"), h("ol",
          h("li", "Für jeden Teil des Gerüsts max. 5 Stichworte – keine ganzen Sätze."),
          h("li", "Ein persönliches Beispiel pro Leitpunkt (Beruf, Herkunftsland, Alltag)."),
          h("li", "Einleitung und Schluss als Satzanfang notieren."),
          h("li", "Letzte Minuten: leise einmal durchsprechen."))),
        geruestKarte(true) || h("details.tips", h("summary", "💡 Aufbau einer guten Präsentation"), h("ol",
          h("li", "Einleitung: Thema nennen, Gliederung ankündigen („Ich möchte zunächst …, danach …, abschließend …“)."),
          h("li", "Jeden Leitpunkt ansprechen – mit Beispiel."),
          h("li", "Eigene Meinung begründen."),
          h("li", "Schluss: kurz zusammenfassen, Ausblick, „Vielen Dank für Ihre Aufmerksamkeit.“"),
          h("li", "Ziel: 3–4 Minuten, frei sprechen, Blickkontakt."))),
        h("details", h("summary", "📝 Muster-Notizzettel"), h("ul", (thema.stichpunkte || []).map((s) => h("li", s)))),
        notes,
        h("button.btn.primary.wide", { onclick: () => { timer.stop(); present(notes.value); } }, "Ich bin bereit – Präsentation starten"));
    }

    function present(notes) {
      clear(el);
      const box = speakBox({ targetSec: [180, 240], tag: "praes", rows: 8, label: "Präsentation starten" });
      el.append(h("div.ex-head", h("button.icon-btn", { onclick: async () => { if (await confirmBox("Abbrechen?", "")) { stopAll(); await box.stop(); resolve({ aborted: true }); } } }, "✕"), h("strong", "Präsentation (Ziel: 3–4 Min.)"), h("span")),
        h("p.small.muted", "Tippe auf den Knopf und sprich frei – der Balken zeigt dir die Zeit. Tippe am Ende auf „Fertig“."),
        geruestKarte(false),
        notes ? h("details", h("summary", "Deine Notizen"), h("pre.notes", notes)) : null,
        box.el, azureHint(),
        h("button.btn.good.wide", { onclick: async (e) => { e.target.disabled = true; e.target.textContent = "Einen Moment …"; await box.settled(); followUp(box.text(), Math.round(box.duration), box); } }, "Weiter zu 1B"));
    }

    async function followUp(text, sec, box1) {
      clear(el);
      el.append(thinking(h("p", "Die Partnerin hat zugehört und bereitet ihre Rückfrage vor …")));
      let fragen = null, zusammenfassung = null;
      if (text.split(/\s+/).length > 40 && (await ai.available()).ok) {
        try {
          const { data } = await ai.call({
            system: sysBase() + " Du spielst die Gesprächspartnerin in Teil 1B: Du fasst die Präsentation in 2–3 Sätzen zusammen und stellst eine natürliche, inhaltliche Anschlussfrage (gesprochenes C1-Deutsch).",
            messages: [{ role: "user", content: `Thema: ${thema.titel}\nAufgabe: ${thema.aufgabe}\nPräsentation:\n"""${text}"""` }],
            schema: S.obj({ zusammenfassung: S.str, frage: S.str }),
            maxTokens: 3000, effort: "low",
          });
          zusammenfassung = data.zusammenfassung;
          fragen = [data.frage];
        } catch (e) { /* Fallback unten */ }
      }
      if (!fragen) fragen = [(thema.anschlussfragen || ["Was ist für Sie der wichtigste Punkt?"])[Math.floor(Math.random() * (thema.anschlussfragen?.length || 1))]];
      clear(el);
      const ask = (zusammenfassung ? zusammenfassung + " " : "") + fragen[0];
      const sch = (await load("sprechtraining"))?.schablonen?.antwort_1b || [];
      const box = speakBox({ targetSec: [30, 90], tag: "1b", rows: 4, label: "Antworten" });
      el.append(h("div.ex-head", h("span"), h("strong", "Teil 1B – Anschlussfrage"), h("span")),
        h("div.bubble.partner", h("div.small.muted", "Partnerin"), zusammenfassung ? h("p", zusammenfassung) : null, h("p", h("strong", fragen[0])), h("button.btn.small.ghost", { onclick: () => speakOnce(ask, "B") }, "🔊 Anhören")),
        sch.length ? h("details.tips", h("summary", "🧱 So antwortest du (30–90 Sek.)"), h("ol", sch.map((s) => h("li", s)))) : null,
        box.el,
        h("button.btn.primary.wide", { onclick: async (e) => { e.target.disabled = true; await box.settled(); feedback(text, sec, box.text(), ask, box1, box); } }, "Antwort abschicken"));
      speakOnce(ask, "B");
    }

    async function feedback(text, sec, answer, ask, box1, box2) {
      stopAll();
      clear(el);
      const zeit = `Sprechzeit: ${fmtTime(sec)} (Ziel 3–4 Min.)`;
      const av = await ai.available();
      // erste ganze Aufnahme dieses Themas aufheben (Vergleich später)
      const firstId = "voll:" + themaId;
      const first = await getRecording(firstId);
      if (!first && box1?.blob) keepRecording(firstId, box1.blob, { titel: thema.titel });
      if (text.split(/\s+/).length > 40 && av.ok) {
        el.append(thinking(h("p", "Feedback wird erstellt …")));
        try {
          const { data, usd } = await ai.call({
            system: sysBase() + "\nDu bist eine erfahrene telc-Prüferin und freundliche Lehrerin. " + MUENDLICH_KRIT + " Bewerte ehrlich (lieber etwas streng). Erklärsprache einfach (B2). Beginne bei den Tipps mit dem wichtigsten nächsten Schritt.",
            messages: [{ role: "user", content: `Teil 1A Präsentation – Thema: ${thema.titel}\nAufgabe: ${thema.aufgabe}\nLeitpunkte: ${thema.leitpunkte.join("; ")}\n${zeit}. ${zeitInfo(box1)}\nPräsentation:\n"""${text}"""\n\nTeil 1B – Frage der Partnerin: ${ask}\nAntwort (${zeitInfo(box2)}):\n"""${answer || "(keine Antwort)"}"""` }],
            schema: feedbackSchema(["teil1a", "teil1b"]),
            maxTokens: 12000,
          });
          return showSpeakFeedback(el, data, { parts: { teil1a: 6, teil1b: 4 }, usd, sec, modulTeil: "1a", itemId: blatt.id, resolve: finish, extra: thema.muster, stats: box1?.result?.stats, first: first && box1?.result ? { first, now: box1.result.url } : null });
        } catch (e) {
          toast(e instanceof AiUnavailable ? e.message : "KI-Feedback nicht möglich");
        }
      }
      // ohne KI
      clear(el);
      el.append(h("div.ex-head", h("span"), h("strong", "Selbstkontrolle"), h("span")),
        h("p.callout", av.ok ? "Für KI-Feedback braucht die App deinen Text (Aufnahme mit Texterkennung oder Diktat, mind. 40 Wörter)." : av.msg),
        h("p", zeit),
        box1?.result ? h("p.small", "⏱️ " + fluencyNote(box1.result.stats)) : null,
        h("details", { open: true }, h("summary", "📄 Mustervortrag"), h("div.model-text", { html: md(thema.muster || "") })),
        h("h3", "Checkliste"),
        h("div.checks", ["Einleitung mit Gliederung", "Alle Leitpunkte angesprochen", "Beispiele gegeben", "Eigene Meinung begründet", "Schluss mit Zusammenfassung", "3–4 Minuten frei gesprochen", "Frage aus 1B direkt beantwortet"].map((c) => h("label.check", h("input", { type: "checkbox" }), h("span", c)))),
        h("button.btn.primary.wide", { onclick: async () => {
          const n = el.querySelectorAll(".checks input:checked").length;
          const pts = Math.round((n / 7) * 10);
          await store.addAttempt({ modul: "sprechen", teil: "1a", itemId: blatt.id, score: pts, max: 10, sec, xp: 25, meta: { selbst: true } });
          finish({ score: pts, max: 10, xp: 25 });
        } }, "Speichern"));
    }
  });
}

// ---------------- 1B, Rolle „Zuhörende“ ----------------
/** Kurzvortrag anhören → Stichworte → 45 s zusammenfassen + Anschlussfrage stellen → kurze Rückmeldung. */
export async function zuhoeren(el, id) {
  const data = await load("sprechtraining");
  const g = data?.geruest?.[id];
  if (!g?.kurzvortrag) return {};
  const sp = await load("sprechen");
  const [bid, ti] = id.split("-");
  const titel = sp.praesentation.find((b) => b.id === bid)?.themen[+ti]?.titel || "Kurzvortrag";
  const url = await audioFor("kv_" + id);
  return new Promise((resolve) => {
    clear(el);
    const notes = h("textarea.answer", { rows: 4, placeholder: "Stichworte beim Zuhören: Thema? 2 Hauptpunkte? Was möchtest du fragen?" });
    let gehoert = 0;
    const play = async () => { gehoert++; if (url) await playUrl(url); else await speakOnce(g.kurzvortrag, "A"); };
    const sch = data.schablonen?.zusammenfassen_1b || [];
    const box = speakBox({ targetSec: [30, 60], tag: "1b-z", rows: 3, label: "Zusammenfassen + fragen" });
    const out = h("div");
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => { stopAll(); resolve({ aborted: true }); } }, "✕"), h("strong", "1B – Rollenwechsel: Du hörst zu"), h("span")),
      tarsiSays("In der Prüfung hörst du auch die Präsentation deiner Partnerin. Danach fasst du sie kurz zusammen und stellst eine Frage.", "happy"),
      h("div.card", h("strong", `🎧 Kurzvortrag: ${titel}`), h("p.small.muted", "ca. 2 Minuten – in der Prüfung hörst du nur einmal."),
        h("button.btn.primary", { onclick: play }, "▶ Anhören"), h("button.btn.small.ghost", { onclick: () => stopAll() }, "⏹")),
      notes,
      sch.length ? h("details.tips", { open: true }, h("summary", "🧱 So fasst du zusammen (ca. 45 Sek.)"), h("ol", sch.map((s) => h("li", s)))) : null,
      box.el, out,
      h("button.btn.primary.wide", { onclick: async (e) => {
        e.target.disabled = true;
        stopAll();
        await box.settled();
        const text = box.text();
        const av = await ai.available();
        if (text && av.ok) {
          out.append(thinking(h("p", "Tarsi prüft deine Zusammenfassung …")));
          try {
            const { data: d } = await ai.call({
              system: sysBase() + " Du bist eine freundliche telc-Trainerin. Die Lernerin hat einen Kurzvortrag gehört und fasst ihn in Teil 1B zusammen und stellt eine Anschlussfrage. Gib kurze Rückmeldung (einfaches Deutsch).",
              messages: [{ role: "user", content: `Kurzvortrag:\n"""${g.kurzvortrag}"""\nKernpunkte: ${(g.kernpunkte || []).join(" | ")}\n\nIhre Zusammenfassung + Frage (${zeitInfo(box)}):\n"""${text}"""` }],
              schema: S.obj({ getroffen: S.arr(S.str), gefehlt: S.arr(S.str), frage_ok: S.bool, frage_kommentar: S.str, tipp: S.str }),
              maxTokens: 3000, effort: "low",
            });
            clear(out);
            out.append(h("div.fb3",
              h("div.fb-line.good", h("b", "✓ Erfasst: "), (d.getroffen || []).join(" · ") || "–"),
              d.gefehlt?.length ? h("div.fb-line.next", h("b", "→ Gefehlt: "), d.gefehlt.join(" · ")) : null,
              h("div.fb-line" + (d.frage_ok ? ".good" : ".next"), h("b", d.frage_ok ? "✓ Frage: " : "→ Frage: "), d.frage_kommentar),
              h("div.fb-line.better", h("b", "✨ "), d.tipp)));
            await store.addAttempt({ modul: "sprechen", teil: "1b-zuhoeren", itemId: id, score: (d.getroffen || []).length + (d.frage_ok ? 1 : 0), max: (g.kernpunkte || []).length + 1, xp: 8, meta: { ohneWertung: true, ki: true } });
          } catch (_) { clear(out); }
        }
        out.append(h("details", h("summary", "📄 Muster-Zusammenfassung + Fragen"), h("p", g.musterzusammenfassung || ""), h("ul", (g.musterfragen || []).map((f) => h("li", f)))),
          h("button.btn.primary.wide", { onclick: () => resolve({}) }, "Weiter"));
        e.target.remove();
      } }, "Fertig"));
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

async function showSpeakFeedback(el, d, { parts, usd, sec, modulTeil, itemId, resolve, extra, stats, first }) {
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
    rows.push(h("div.krit-row", h("span.stufe", `${v}/8`), h("div", h("strong", name), h("div.small", d[k]?.begruendung || ""), k === "fluessigkeit" && stats?.wpm ? h("div.small.muted", "⏱️ Messwerte: " + fluencyNote(stats)) : null)));
  }
  rows.push(h("div.krit-row", h("span.stufe", "–"), h("div", h("strong", "Aussprache"), h("div.small", "Aus Text nicht bewertbar – hör dir deine Aufnahme an."))));
  const xp = 30;
  await store.addAttempt({ modul: "sprechen", teil: modulTeil, itemId, score: got, max, sec, xp, meta: { ki: true } });
  const lo = Math.max(0, got - 2), hi = Math.min(max, got + 2);
  el.append(h("div.ex-head", h("span"), h("strong", "Feedback"), h("span")),
    h("div.score-big", h("div", `ca. ${lo}–${hi} / ${max}`), h("div.muted.small", `KI-Schätzung (ohne Aussprache) · Bestehen ≈ 60 % = ${Math.round(max * 0.6)}`), h("div.xp-pill", `+${xp} XP`)),
    d.tipps?.length ? h("div.card", h("strong", "🎯 Dein nächster Schritt"), h("p", d.tipps[0])) : null,
    first ? h("div.card.soft", h("div.small", `Deine erste Aufnahme dieses Themas (${new Date(first.first.t).toLocaleDateString("de-DE")}) – hör den Unterschied!`),
      h("div.row", h("button.btn.small", { onclick: () => playUrl(URL.createObjectURL(first.first.blob)) }, "▶ Damals"), h("button.btn.small", { onclick: () => playUrl(first.now) }, "▶ Heute"))) : null,
    h("div.krit", rows),
    d.struktur ? h("div.card", h("strong", "🧱 Struktur"), h("p", d.struktur)) : null,
    d.interaktion ? h("div.card", h("strong", "🤝 Interaktion"), h("p", d.interaktion)) : null,
    d.staerken?.length ? h("div.card.ok", h("strong", "👍 Stark"), h("ul", d.staerken.map((s) => h("li", s)))) : null,
    d.tipps?.length > 1 ? h("div.card", h("strong", "Weitere Tipps"), h("ul", d.tipps.slice(1).map((s) => h("li", s)))) : null,
    d.bessere_formulierungen?.length ? h("div.card", h("strong", "💬 Besser formuliert"), h("ul", d.bessere_formulierungen.map((b) => h("li", h("s", b.statt), " → ", h("strong", b.besser), " ", h("button.btn.small.ghost", { onclick: () => speakOnce(b.besser, "B") }, "🔊"))))) : null,
    d.fehler?.length ? h("div.card", h("strong", "✏️ Mögliche Fehler"), h("p.small.muted", "Achtung: Manches kann ein Erkennungsfehler sein. Übernimm nur, was du wirklich so gesagt hast."),
      h("ul", d.fehler.map((f) => h("li", `„${f.zitat}“ → „${f.korrektur}“ – ${f.erklaerung} `, h("button.btn.small", { onclick: async (e) => {
        await store.addError({ modul: "sprechen", kategorie: f.kategorie || "wortschatz", itemRef: `${itemId}#${f.zitat}`, frage: `Aus deinem Gespräch – korrigiere:\n„${f.zitat}“`, richtig: f.korrektur, gegeben: f.zitat, erklaerung: f.erklaerung, typ: "input" });
        e.target.replaceWith(h("span.small", "✓ im Fehlerprotokoll"));
      } }, "➕ Fehlerprotokoll"))))) : null,
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
    const maxTurns = opts.turns || 14;
    const ziel = (opts.minuten || 6) * 60;
    const start = Date.now();
    let mySec = 0, partnerSec = 0;
    const chat = h("div.chat");
    // 6-Minuten-Uhr: läuft nur, während gesprochen wird (hält an, solange die KI nachdenkt)
    const clockFill = h("div.sbar-fill");
    const clockTxt = h("div.rec-time", "0:00 / " + fmtTime(ziel));
    const anteil = h("div.small.muted.center");
    const clock = new Timer({ mode: "up", onTick: (v) => {
      clockTxt.textContent = fmtTime(Math.floor(v)) + " / " + fmtTime(ziel) + (v >= ziel ? " – Zeit! Du kannst zum Feedback." : "");
      clockFill.style.width = Math.min(100, (v / ziel) * 100) + "%";
      clockBar.classList.toggle("over", v >= ziel);
    } });
    const clockBar = h("div.sbar", clockFill);
    const upAnteil = () => { const t = mySec + partnerSec; if (t > 0) anteil.textContent = `Dein Sprechanteil: ${Math.round((mySec / t) * 100)} % (Ziel: ca. 50 %)`; };
    let sending = false;
    let box;
    const sch = (await load("sprechtraining"))?.schablonen?.teil2_beitrag || [];
    const newBox = () => {
      box = speakBox({ tag: "disk", rows: 3, label: "Antworten", targetSec: [20, 60],
        onStart: () => { stopAll(); clock.start(); },
        onStop: (dur) => { mySec += dur; upAnteil(); },
        onDone: () => send() });
      boxWrap.textContent = "";
      boxWrap.append(box.el);
    };
    const boxWrap = h("div");
    const sendBtn = h("button.btn.wide", { onclick: () => send() }, "Text senden");
    const endBtn = h("button.btn.wide", { onclick: () => finish() }, "Diskussion beenden & Feedback");
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: async () => { if (await confirmBox("Abbrechen?", "")) { stopAll(); clock.stop(); await box?.stop(); resolve({ aborted: true }); } } }, "✕"), h("strong", "Teil 2 – Diskussion"), h("span")),
      h("div.task-box", h("blockquote", "„" + d.zitat.replace(/^[„"]+|[“"]+$/g, "") + "“", h("cite", d.person)), h("ul", d.leitpunkte.map((l) => h("li", l))), h("div.help-row", taskHelpButton("mp2", d.id))),
      sch.length ? h("details.tips", { open: true }, h("summary", "🧱 Pro Beitrag (3–5 Sätze)"), h("ol", sch.map((s) => h("li", s)))) : null,
      h("details.tips", h("summary", "💡 Redemittel (antippen = anhören)"), await redemittelList(["zustimmen", "widersprechen", "kompromiss", "nachfragen", "zeit_gewinnen", "meinung"])),
      !av.ok ? h("p.callout", av.msg + " Ohne KI liest die Partnerin vorbereitete Gegenargumente vor.") : null,
      clockBar, clockTxt, anteil,
      chat, boxWrap, azureHint(), sendBtn, endBtn);
    newBox();
    const partnerSay = async (text) => {
      chat.append(h("div.bubble.partner", h("div.small.muted", "Partnerin"), h("p", text), h("button.btn.small.ghost", { onclick: () => speakOnce(text, "B") }, "🔊")));
      chat.lastChild.scrollIntoView({ behavior: "smooth", block: "end" });
      clock.start();
      partnerSec += text.length / 15; // ca. 15 Zeichen pro Sekunde gesprochen
      upAnteil();
      await speakOnce(text, "B");
      upAnteil();
    };
    const scripted = [...(d.contra || []), ...(d.pro || [])];
    const system = sysBase() + `\nDu bist die Gesprächspartnerin der Lernerin in Teil 2 der mündlichen Prüfung (Diskussion, ca. 6 Minuten). Thema/Zitat: „${d.zitat}“ (${d.person}). Leitpunkte: ${d.leitpunkte.join("; ")}.
Verhalte dich wie eine gute Prüfungspartnerin auf C1-Niveau: Vertritt eher die GEGENPOSITION zur Lernerin, bringe konkrete Argumente und Beispiele, frage nach, widersprich höflich, aber gib ihr genug Raum: deine Beiträge haben nur 2–3 Sätze (gesprochene Sprache) und enden meist mit einer Frage an sie. Sprich nach und nach die Leitpunkte an. Gegen Ende darfst du einen Kompromiss vorschlagen. Korrigiere sie NICHT während des Gesprächs.`;

    // Eröffnung
    if (av.ok) {
      chat.append(thinking(h("p", "Die Partnerin überlegt …")));
      try {
        const { data } = await ai.call({ system, messages: [{ role: "user", content: "Eröffne die Diskussion mit einer kurzen Einschätzung des Zitats und einer Frage an mich." }], schema: S.obj({ beitrag: S.str }), maxTokens: 2000, effort: "low" });
        chat.lastChild.remove();
        turns.push({ role: "user", content: "Eröffne die Diskussion mit einer kurzen Einschätzung des Zitats und einer Frage an mich." }, { role: "assistant", content: JSON.stringify(data) });
        partnerSay(data.beitrag);
      } catch (e) { chat.lastChild?.remove(); toast(e.message); partnerSay(`Was halten Sie von dieser Aussage? Ich persönlich sehe das eher kritisch: ${scripted[0] || ""}`); }
    } else partnerSay(`Was halten Sie von dieser Aussage? Ich sehe das eher kritisch. ${scripted.shift() || ""}`);

    let userCount = 0;
    async function send() {
      if (sending) return;
      if (box.recording) return toast("Tippe erst auf „Fertig“.");
      const text = box.text();
      if (!text) return toast("Bitte erst antworten (Aufnahme oder Diktat 🎤).");
      sending = true;
      clock.pause(); // KI-Zeit zählt nicht
      userCount++;
      chat.append(h("div.bubble.me", h("p", text), box.result ? h("button.btn.small.ghost", { onclick: ((u) => () => playUrl(u))(box.result.url) }, "▶") : null));
      turns.push({ role: "user", content: text });
      newBox();
      if (userCount >= maxTurns) { sending = false; return finish(); }
      if (av.ok) {
        chat.append(thinking(h("p", "Die Partnerin überlegt …")));
        try {
          const { data } = await ai.call({ system, messages: turns, schema: S.obj({ beitrag: S.str }), maxTokens: 2000, effort: "low" });
          chat.lastChild.remove();
          turns.push({ role: "assistant", content: JSON.stringify(data) });
          sending = false;
          await partnerSay(data.beitrag);
        } catch (e) { chat.lastChild?.remove(); toast(e.message); sending = false; await partnerSay(scripted.shift() || "Können Sie das noch genauer erklären?"); }
      } else {
        sending = false;
        await partnerSay(scripted.length ? "Da muss ich widersprechen: " + scripted.shift() : "Und wie sähe für Sie ein Kompromiss aus?");
      }
    }

    async function finish() {
      stopAll();
      clock.stop();
      await box.stop();
      const sec = Math.round(clock.elapsed || (Date.now() - start) / 1000);
      const mine = turns.filter((t) => t.role === "user").slice(av.ok ? 1 : 0).map((t) => t.content);
      const transcript = turns.slice(av.ok ? 1 : 0).map((t) => (t.role === "user" ? "LERNERIN: " + t.content : "PARTNERIN: " + (JSON.parse(t.content).beitrag || ""))).join("\n");
      if (av.ok && mine.join(" ").split(/\s+/).length > 30) {
        clear(el).append(thinking(h("p", "Feedback wird erstellt …")));
        try {
          const { data, usd } = await ai.call({
            system: sysBase() + "\nDu bist eine erfahrene telc-Prüferin und freundliche Lehrerin. " + MUENDLICH_KRIT + " Bewerte NUR die Beiträge der Lernerin (nicht die der Partnerin), ehrlich. Bewerte auch die Interaktion (auf Argumente eingehen, nachfragen, widersprechen, zustimmen, Kompromiss, Leitpunkte abgedeckt) – schreibe in „interaktion“ konkret, was davon sie gezeigt hat und was gefehlt hat.",
            messages: [{ role: "user", content: `Diskussion – Zitat: „${d.zitat}“\nLeitpunkte: ${d.leitpunkte.join("; ")}\nDauer (ohne KI-Wartezeit): ${fmtTime(sec)}; Sprechanteil der Lernerin ca. ${Math.round((mySec / Math.max(1, mySec + partnerSec)) * 100)} %\nVerlauf:\n${transcript}` }],
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
    if (items.length) wrap.append(h("div.rm-group", h("strong.small", names[f] + ": "), items.map((r) => h("button.chip.rm", { onclick: () => speakOnce(r.ausdruck.replace(/\s*…\s*/g, " "), "B") }, r.ausdruck))));
  }
  if (!wrap.children.length) wrap.append(h("p.small.muted", "Redemittel werden noch geladen."));
  return wrap;
}

export { redemittelList };
