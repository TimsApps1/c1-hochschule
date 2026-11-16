// Hörverstehen Teil 1–3 mit Sprachausgabe.
// Prüfungsmodus: Lesezeit wie in der Prüfung, Text läuft genau EINMAL, keine Pause/Rücksprung.
// Übungsmodus: Pause, Zurückspulen, Tempo 0,8× / 1,0× / 1,15×, mehrfach hören, Transkript nach dem Lösen.
import { h, clear, md, Timer, fmtTime, confirmBox, toast, norm } from "./ui.js";
import { store } from "./store.js";
import { TEILE } from "./analytics.js";
import { ScriptPlayer, ttsSupported, voicesReady, stopAll } from "./tts.js";
import { FilePlayer, audioFor } from "./audio.js";
import { taskHelpButton } from "./aufgaben.js";
import { setExamMode } from "./ask.js";

const ZAHL = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
const LESEZEIT = { hv1: 60, hv2: 180, hv3: 60 };

export const HOER_TIPPS = {
  hv1: ["In der Lesezeit: Schlüsselwörter der 10 Aussagen markieren (Meinung? Kritik? Zweifel?).", "Die Aussagen **umschreiben** das Gehörte – achte auf die Haltung, nicht auf gleiche Wörter.", "Wenn du unsicher bist: Kreuz setzen und weiter – es gibt keine zweite Chance."],
  hv2: ["3 Minuten Lesezeit nutzen: Satzanfänge lesen, Namen und Schlüsselwörter markieren.", "Die Items kommen **in der Reihenfolge** des Gesprächs.", "Distraktoren benutzen oft Wörter aus dem Text – aber mit anderer Aussage."],
  hv3: ["In der Lesezeit die Folien lesen: Was fehlt – eine Ursache, eine Zahl, ein Beispiel?", "Nur **Stichpunkte** notieren (3–6 Wörter), keine ganzen Sätze.", "Achte auf Gliederungssignale: „erstens“, „ich komme nun zu …“, „zusammenfassend“.", "Rechtschreibung zählt nicht – die Notiz muss aber verständlich sein."],
};

function segmentsFor(item) {
  if (item.teil === "hv1") {
    const segs = [];
    item.sprecher.forEach((s) => {
      segs.push({ sp: "C", text: `Nummer ${ZAHL[s.nr] || s.nr}.`, intro: true, nr: s.nr });
      segs.push({ sp: s.sp || "A", text: s.text, nr: s.nr, name: s.name });
    });
    return segs;
  }
  const names = Object.fromEntries((item.rollen || []).map((r) => [r.sp, r.name]));
  return item.skript.map((s) => ({ ...s, name: names[s.sp] || s.sp }));
}

function audioBar({ segments, exam, onEnd, onSegment, file }) {
  const status = h("span.small.muted", file ? "🎙️ Sprecheraufnahme" : "bereit");
  const prog = h("div.bar.grow", h("span"));
  let plays = 0;
  const handlers = {
    onSegment: (i) => { prog.firstChild.style.width = Math.round(player.progress * 100) + "%"; onSegment && onSegment(i); },
    onProgress: (p) => { prog.firstChild.style.width = Math.round(p * 100) + "%"; },
    onEnd: () => { prog.firstChild.style.width = "100%"; status.textContent = "Ende"; playBtn.textContent = exam ? "✓ gehört" : "↻ Nochmal"; playBtn.disabled = !!exam; onEnd && onEnd(plays); },
    onState: (s) => { status.textContent = { playing: "läuft …", paused: "Pause", idle: file ? "🎙️ Sprecheraufnahme bereit" : "bereit", ended: "Ende", loading: "lädt …", error: "⚠️ Audio nicht ladbar" }[s]; playBtn.textContent = s === "playing" ? (exam ? "🔊 läuft" : "⏸ Pause") : s === "loading" ? "⏳ lädt …" : "▶︎ Abspielen"; },
  };
  const player = file ? new FilePlayer(file, { rate: store.settings.ttsRate || 1, ...handlers }) : new ScriptPlayer(segments, handlers);
  // erst nach dem Aufbau der Knöpfe vorladen (onState greift auf playBtn zu)
  if (file) setTimeout(() => player.prepare().catch(() => toast("Audio konnte nicht geladen werden – bitte Internet prüfen.")), 0);
  const playBtn = h("button.btn.primary", { onclick: () => {
    if (player.state === "playing") { if (!exam) player.pause(); return; }
    if (player.state === "loading") return;
    if (exam && plays >= 1 && player.state !== "paused") return;
    if (player.state === "ended" || player.state === "idle" || player.state === "error") plays++;
    playBtn.classList.remove("pulse");
    Promise.resolve(player.play()).catch((e) => toast("Abspielen nicht möglich: " + e.message));
  } }, "▶︎ Abspielen");
  const ctrls = [];
  if (!exam) {
    ctrls.push(h("button.btn.small", { onclick: () => player.back(file ? 6 : 2) }, file ? "⟲ 6 Sek." : "⟲ 2 Sätze"));
    const rates = [0.8, 1.0, 1.15];
    const seg = h("div.seg.small", rates.map((r) => h("button" + (Math.abs((store.settings.ttsRate || 1) - r) < 0.01 ? ".on" : ""), { onclick: (e) => {
      player.setRate(r);
      store.saveSettings({ ttsRate: r });
      [...seg.children].forEach((b) => b.classList.toggle("on", b === e.currentTarget));
    } }, String(r).replace(".", ",") + "×")));
    ctrls.push(seg);
  }
  const el = h("div.audiobar", h("div.row", playBtn, ...ctrls), h("div.row", prog, status));
  if (!file && !ttsSupported()) el.append(h("p.callout", "Dieser Browser kann nicht vorlesen. Auf dem iPhone in Safari funktioniert es."));
  return { el, player, playBtn, get plays() { return plays; } };
}

function transcript(segments) {
  return h("details.transcript", h("summary", "📜 Transkript"), segments.filter((s) => !s.intro).map((s) => h("p", h("strong", (s.name || s.sp) + ": "), s.text)));
}

/** Prüfungs-/Übungsplayer für einen Hörtext. */
export function hoerenExam(el, item, opts = {}) {
  return new Promise(async (resolve) => {
    await voicesReady();
    const mode = opts.mode || "uebung";
    const exam = mode === "pruefung";
    setExamMode(exam);
    const teil = item.teil;
    clear(el);
    const segments = segmentsFor(item);
    const file = await audioFor(item.id);
    let submitted = false;
    const timerEl = h("span.timer");
    const close = h("button.icon-btn", { "aria-label": "Beenden", onclick: async () => { if (submitted || (await confirmBox("Abbrechen?", "Deine Antworten gehen verloren."))) { stopAll(); bar.player.stop(); clockTimer?.stop(); resolve({ aborted: true }); } } }, "✕");
    el.append(h("div.ex-head", close, h("div", h("strong", TEILE[teil].name), h("div.muted.small", item.titel)), timerEl));
    if (!exam && HOER_TIPPS[teil]) el.append(h("details.tips", h("summary", "💡 Strategie"), h("ul", HOER_TIPPS[teil].map((t) => h("li", { html: md(t) })))));
    el.append(h("div.help-row", taskHelpButton(teil)), h("p.situation", item.situation || ""));
    const bar = audioBar({ segments, exam, file, onEnd: () => { if (exam) { toast("Hörtext beendet – jetzt Antworten prüfen und abgeben."); } } });
    const phase = h("div.phase");
    el.append(phase, bar.el);
    const body = h("div.tasks");
    el.append(body);
    const foot = h("div.ex-foot");
    el.append(foot);

    // Lesezeit im Prüfungsmodus
    let clockTimer = null;
    if (exam) {
      bar.el.classList.add("locked");
      phase.textContent = `Lesezeit: ${LESEZEIT[teil] / 60} Minute(n). Danach startet der Hörtext automatisch – nur einmal.`;
      const skip = h("button.btn.small", { onclick: () => clockTimer.onEnd() }, "Lesezeit überspringen");
      phase.append(" ", skip);
      clockTimer = new Timer({ seconds: LESEZEIT[teil], mode: "down", onTick: (v) => (timerEl.textContent = "📖 " + fmtTime(v)), onEnd: () => {
        clockTimer.stop();
        phase.textContent = "Lesezeit vorbei – tippe auf ▶︎. Der Hörtext läuft nur einmal.";
        bar.el.classList.remove("locked");
        bar.playBtn.classList.add("pulse");
        timerEl.textContent = "🔊";
      } });
      clockTimer.start();
    } else {
      clockTimer = new Timer({ mode: "up", onTick: (v) => (timerEl.textContent = "⏱ " + fmtTime(v)) });
      clockTimer.start();
    }

    const answers = {};
    const grade = teil === "hv1" ? buildHv1(item, body, answers) : teil === "hv2" ? buildHv2(item, body, answers) : buildHv3(item, body, answers, exam);

    foot.append(h("button.btn.primary.wide", { onclick: () => submit() }, "Abgeben"));
    async function submit() {
      if (submitted) return;
      if (bar.player.state === "playing" && !(await confirmBox("Abgeben?", "Der Hörtext läuft noch."))) return;
      submitted = true;
      bar.player.stop();
      clockTimer?.stop();
      const { score, max, wrong } = await grade();
      for (const w of wrong) await store.addError({ modul: "hoeren", kategorie: "hoerverstehen", itemRef: `${item.id}#${w.nr}`, frage: w.frage, optionen: w.optionen || null, loesung: w.loesung ?? null, richtig: w.richtig, gegeben: w.gegeben, erklaerung: w.erklaerung });
      const sec = Math.round(clockTimer?.elapsed || 0);
      const xp = 10 + Math.round((score / max) * 20);
      if (!opts.embedded?.noAttempt) answers._attempt = await store.addAttempt({ modul: "hoeren", teil, itemId: item.id, score, max, sec, xp, meta: { mode, plays: bar.plays } });
      answers._result = { score };
      body.prepend(h("div.score-box", h("strong", `${score} / ${max} Punkte`), exam ? null : h("span.muted.small", ` · ${bar.plays}× gehört`)));
      body.append(transcript(segments));
      clear(foot).append(h("button.btn.primary.wide", { onclick: () => resolve({ score: answers._result?.score ?? score, max, sec, xp }) }, "Weiter"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function buildHv1(item, body, answers) {
  body.append(h("div.statements", item.aussagen.map((a) => h("div.sentence", h("b", a.b + ") "), a.text))));
  const rows = {};
  for (const s of item.sprecher) {
    const sel = h("div.letters", item.aussagen.map((a) => h("button.letter", { onclick: () => { answers[s.nr] = a.b; [...sel.children].forEach((x) => x.classList.toggle("sel", x.textContent === a.b)); } }, a.b)));
    rows[s.nr] = sel;
    body.append(h("div.qrow", h("span.qnum", s.nr), sel));
  }
  return async () => {
    let right = 0;
    const wrong = [];
    for (const s of item.sprecher) {
      const sol = item.loesungen[s.nr];
      const ok = answers[s.nr] === sol;
      if (ok) right++;
      [...rows[s.nr].children].forEach((x) => { x.classList.toggle("right", x.textContent === sol); x.classList.toggle("wrong", !ok && x.textContent === answers[s.nr]); });
      const solText = item.aussagen.find((a) => a.b === sol)?.text;
      rows[s.nr].after(h("div.exp" + (ok ? ".ok" : ".no"), h("strong", `${s.name}: ${sol}`), h("div.small", solText), h("div.small", { html: md(item.erklaerungen?.[s.nr] || "") })));
      if (!ok) wrong.push({ nr: s.nr, frage: `Hören 1 („${item.titel}“) – Person ${s.nr}: „${s.text.slice(0, 160)}…“\nWelche Aussage passt?`, richtig: `${sol}) ${solText}`, gegeben: answers[s.nr] || "–", erklaerung: item.erklaerungen?.[s.nr] || "" });
    }
    return { score: right, max: 8, wrong };
  };
}

function buildHv2(item, body, answers) {
  const rows = {};
  for (const q of item.items) {
    const sel = h("div.options", q.optionen.map((o, i) => h("button.option", { onclick: () => { answers[q.nr] = i; [...sel.children].forEach((x, j) => x.classList.toggle("sel", j === i)); } }, `${"abc"[i]}) ${o}`)));
    rows[q.nr] = sel;
    body.append(h("div.qblock", h("p", h("span.qnum", q.nr), " ", h("strong", q.stamm)), sel));
  }
  return async () => {
    let right = 0;
    const wrong = [];
    for (const q of item.items) {
      const ok = answers[q.nr] === q.loesung;
      if (ok) right++;
      [...rows[q.nr].children].forEach((x, j) => { x.classList.toggle("right", j === q.loesung); x.classList.toggle("wrong", !ok && j === answers[q.nr]); });
      rows[q.nr].after(h("div.exp" + (ok ? ".ok" : ".no"), h("div.small", { html: md(q.erklaerung || "") })));
      if (!ok) wrong.push({ nr: q.nr, frage: `Hören 2 („${item.titel}“): ${q.stamm}`, optionen: q.optionen, loesung: q.loesung, richtig: q.optionen[q.loesung], gegeben: q.optionen[answers[q.nr]] || "–", erklaerung: q.erklaerung || "" });
    }
    return { score: right * 2, max: 20, wrong };
  };
}

/** Notiz bewerten: alle Schlüsselwort-Gruppen = 2, mind. Hälfte = 1, sonst 0. */
export function scoreNote(note, gap) {
  const n = norm(note);
  if (!n) return 0;
  const groups = gap.schluesselwoerter || [];
  if (!groups.length) return norm(gap.loesung) === n ? 2 : 0;
  const hit = groups.filter((g) => g.some((w) => n.includes(norm(w)))).length;
  if (hit === groups.length) return 2;
  if (hit >= Math.ceil(groups.length / 2)) return 1;
  return 0;
}

function buildHv3(item, body, answers, exam) {
  const inputs = {};
  if (!exam) body.append(h("details.notes", h("summary", "🗒️ Notizblock (für dich, wird nicht bewertet)"), h("textarea.answer", { rows: 5, placeholder: "Stichpunkte während des Hörens …" })));
  for (const f of item.folien) {
    const slide = h("div.slide", h("div.slide-title", f.titel));
    for (const p of f.punkte) {
      if (p.luecke) {
        const inp = h("input.note", { type: "text", placeholder: `(${p.luecke}) …`, autocomplete: "off", autocapitalize: "off", oninput: (e) => (answers[p.luecke] = e.target.value) });
        inputs[p.luecke] = inp;
        slide.append(h("div.slide-pt", h("span.qnum", p.luecke), inp));
      } else slide.append(h("div.slide-pt", "• " + p.text));
    }
    body.append(slide);
  }
  return async () => {
    let score = 0;
    const wrong = [];
    for (const f of item.folien) for (const p of f.punkte) {
      if (!p.luecke) continue;
      const given = answers[p.luecke] || "";
      let pts = scoreNote(given, p);
      score += pts;
      const inp = inputs[p.luecke];
      inp.disabled = true;
      const info = h("div.exp" + (pts === 2 ? ".ok" : ".no"), h("strong", `${pts}/2 · Lösung: ${p.loesung}`), h("div.small", { html: md(p.erklaerung || "") }));
      if (pts < 2 && given.trim()) {
        // Selbstkorrektur: Die Schlüsselwortprüfung ist streng – die Lernerin darf eine sinngleiche Notiz anerkennen.
        info.append(h("button.btn.small", { onclick: (e) => { const d = 2 - pts; score += d; pts = 2; if (answers._attempt) { answers._attempt.score += d; store.updateAttempt(answers._attempt); } if (answers._result) answers._result.score += d; info.className = "exp ok"; e.target.replaceWith(h("span.small", " ✓ als richtig gewertet")); scoreBox && (scoreBox.textContent = `${score} / 20 Punkte`); } }, "Meine Notiz meint dasselbe"));
      }
      inp.closest(".slide-pt").after(info);
      if (pts < 2) wrong.push({ nr: p.luecke, frage: `Hören 3 („${item.titel}“) – Folie „${f.titel}“: Was fehlt bei (${p.luecke})?`, richtig: p.loesung, gegeben: given || "–", erklaerung: p.erklaerung || "" });
    }
    let scoreBox = null;
    setTimeout(() => (scoreBox = body.querySelector(".score-box strong")), 0);
    return { score, max: 20, wrong };
  };
}
