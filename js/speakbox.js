// „Aufnehmen, dann umwandeln“: ein Baustein für alle Sprechübungen.
// 1) Großer Knopf → Aufnahme (mit Zeitbalken zum Ziel), 2) Stopp → sofort anhörbar,
// 3) Text wird automatisch erkannt (Azure), Zeitwerte (Tempo, Pausen) werden berechnet.
// Ohne Azure-Schlüssel / offline: Diktat-Feld als Rückfall. Fehler → „Erneut erkennen“ mit derselben Aufnahme.
import { h, fmtTime, toast } from "./ui.js";
import { Recorder, recorderSupported, wakeLockSupported, interruptedRecording, clearInterrupted } from "./recorder.js";
import { azure, transcribe, fluencyNote } from "./azure.js";
import { stopAll } from "./tts.js";

/**
 * @param {object} o
 *  targetSec   Ziel-Sprechzeit (Zeitbalken); [min,max] oder Zahl
 *  reference   bekannter Satz → Aussprache-Werte (nur Nachsprechen)
 *  tag         Kennung, um unterbrochene Aufnahmen zuzuordnen
 *  editable    erkannten Text bearbeitbar zeigen (Standard: true)
 *  onDone(res) wird nach erfolgreicher Erkennung/Eingabe aufgerufen
 *  label       Text auf dem Aufnahmeknopf
 */
export function speakBox(o = {}) {
  const target = Array.isArray(o.targetSec) ? o.targetSec : o.targetSec ? [o.targetSec * 0.75, o.targetSec * 1.25] : null;
  const rec = new Recorder({ tag: o.tag || "" });
  let result = null; // { text, words, seconds, stats, accuracy, blob, url }
  let iv = null;
  let blob = null;
  let pending = Promise.resolve();

  const fill = h("div.sbar-fill");
  const bar = target ? h("div.sbar", fill, h("div.sbar-mark", { style: { left: pct(target[0]) + "%" } }), h("div.sbar-mark", { style: { left: pct(target[1]) + "%" } })) : null;
  const time = h("div.rec-time", target ? `Ziel: ${fmtRange(target)}` : "");
  const btn = h("button.rec-btn", { onclick: () => toggle() }, h("span.rec-dot"), h("span.rec-lbl", o.label || "Aufnehmen"));
  const audio = h("audio", { controls: true, class: "hidden" });
  const status = h("div.small.muted.center");
  const stats = h("div.rec-stats.hidden");
  const ta = h("textarea.answer.hidden", { rows: o.rows || 4, placeholder: "Erkannter Text erscheint hier …" });
  const retry = h("button.btn.small.hidden", { onclick: () => recognize() }, "🔄 Erneut erkennen");
  const banner = h("div");
  const wrap = h("div.speakbox", banner, bar, time, h("div.center", btn), status, audio, stats, ta, retry);

  if (!recorderSupported()) {
    btn.classList.add("hidden");
    showDictation("Aufnahme wird auf diesem Gerät nicht unterstützt – bitte per Diktat (🎤 in der Tastatur) sprechen.");
  }

  // Unterbrochene Aufnahme wiederherstellen?
  interruptedRecording().then((r) => {
    if (!r || (o.tag && r.tag !== o.tag)) return;
    banner.append(h("div.callout", h("p", "⚠️ Deine letzte Aufnahme wurde unterbrochen (z. B. Bildschirmsperre). Das Gesprochene ist gespeichert."),
      h("button.btn.small", { onclick: async () => { banner.textContent = ""; await useBlob(r.blob, 0); await clearInterrupted(); } }, "Aufnahme übernehmen"),
      h("button.btn.small.ghost", { onclick: async () => { banner.textContent = ""; await clearInterrupted(); } }, "Verwerfen")));
  });

  function pct(s) {
    const max = target ? target[1] * 1.35 : 60;
    return Math.min(100, (s / max) * 100);
  }
  function fmtRange(t) {
    const f = (s) => (s >= 60 ? fmtTime(Math.round(s)) + " Min." : Math.round(s) + " s");
    return f(t[0]) + " – " + f(t[1]);
  }

  async function toggle() {
    if (rec.recording) return stop();
    stopAll();
    try {
      await rec.start();
    } catch (e) {
      return toast("Mikrofon nicht verfügbar: " + (e.message || e.name) + ". In den iPhone-Einstellungen das Mikrofon für Safari erlauben.");
    }
    result = null;
    o.onStart && o.onStart();
    wrap.classList.add("recording");
    btn.querySelector(".rec-lbl").textContent = "Fertig";
    status.textContent = wakeLockSupported() ? "" : "Tipp: Bildschirm nicht sperren, solange du sprichst.";
    [audio, stats, ta, retry].forEach((x) => x.classList.add("hidden"));
    iv = setInterval(() => {
      const s = rec.seconds;
      time.textContent = "● " + fmtTime(Math.floor(s)) + (target ? ` · Ziel ${fmtRange(target)}` : "");
      if (bar) {
        fill.style.width = pct(s) + "%";
        bar.classList.toggle("ok", s >= target[0] && s <= target[1]);
        bar.classList.toggle("over", s > target[1]);
      }
    }, 250);
  }

  async function stop() {
    clearInterval(iv);
    const url = await rec.stop();
    wrap.classList.remove("recording");
    btn.querySelector(".rec-lbl").textContent = "Neu aufnehmen";
    o.onStop && o.onStop(rec.duration);
    await useBlob(rec.blob, rec.duration, url);
  }

  async function useBlob(b, dur, url) {
    blob = b;
    audio.src = url || URL.createObjectURL(b);
    audio.classList.remove("hidden");
    time.textContent = dur ? `Gesprochen: ${fmtTime(Math.round(dur))}` : "";
    await recognize();
  }

  function recognize() {
    pending = doRecognize();
    return pending;
  }
  async function doRecognize() {
    retry.classList.add("hidden");
    if (!blob) return;
    if (!azure.has()) return showDictation("Automatische Texterkennung ist nicht eingerichtet (Mehr → Spracherkennung). Diktiere deine Antwort zusätzlich (🎤 in der Tastatur) – oder überspringe den Text.");
    status.textContent = "⏳ Text wird erkannt …";
    try {
      const r = await transcribe(blob, { reference: o.reference, onProgress: (i, n) => n > 1 && (status.textContent = `⏳ Text wird erkannt … (${i} von ${n} Teilen fertig)`) });
      result = { ...r, blob, url: audio.src };
      status.textContent = "";
      ta.value = r.text;
      if (o.editable !== false) {
        ta.classList.remove("hidden");
        ta.title = "Erkannter Text – kleine Erkennungsfehler kannst du korrigieren";
      }
      if (!o.reference) {
        const note = fluencyNote(r.stats);
        if (note) { stats.textContent = "⏱️ " + note; stats.classList.remove("hidden"); }
      }
      o.onDone && o.onDone(result);
    } catch (e) {
      status.textContent = "";
      if (["offline", "error", "limit"].includes(e.reason)) retry.classList.remove("hidden");
      if (e.reason === "empty") { toast(e.message); return; }
      showDictation(e.message);
    }
  }

  function showDictation(msg) {
    status.textContent = msg;
    ta.placeholder = "Diktieren: ins Feld tippen, dann 🎤 in der Tastatur …";
    ta.classList.remove("hidden");
    o.onFallback && o.onFallback();
  }

  return {
    el: wrap,
    ta,
    get result() { return result; },
    get blob() { return blob; },
    get recording() { return rec.recording; },
    get duration() { return result?.seconds || rec.duration || 0; },
    /** Wartet, bis Aufnahme gestoppt und Erkennung fertig ist. */
    async settled() { if (rec.recording) await stop(); await pending; },
    /** Text = erkannter (ggf. korrigierter) Text oder Diktat. */
    text: () => ta.value.trim(),
    async stop() { if (rec.recording) await stop(); },
    reset() {
      result = null; blob = null; ta.value = "";
      [audio, stats, ta, retry].forEach((x) => x.classList.add("hidden"));
      status.textContent = "";
      time.textContent = target ? `Ziel: ${fmtRange(target)}` : "";
      if (bar) { fill.style.width = "0"; bar.classList.remove("ok", "over"); }
      btn.querySelector(".rec-lbl").textContent = o.label || "Aufnehmen";
    },
  };
}

/** Kleiner Hinweis, wenn Azure fehlt (einmal pro Bildschirm). */
export function azureHint() {
  if (azure.has()) return null;
  return h("p.small.muted", "💡 Mit Azure-Schlüssel (Mehr → Spracherkennung) wird deine Aufnahme automatisch in Text umgewandelt und die Partnerin spricht mit natürlicher Stimme.");
}

