// Azure Speech direkt aus dem Browser (Bring-your-own-key, wie der Claude-Key):
// - Spracherkennung (Kurzaudio-REST, de-DE): Aufnahme → 16 kHz mono WAV → Text + Wort-Zeitstempel.
//   Längere Aufnahmen werden in Stücke ≤ 50 s geteilt (an der leisesten Stelle) und nacheinander erkannt.
// - Aussprache-Bewertung NUR mit Referenztext (Nachsprechen bekannter Sätze) – im freien Sprechen ist sie unzuverlässig.
// - Flüssigkeit über objektive Zeitwerte: Wörter pro Minute, Pausen > 2 s.
// - Live-Stimme (Neural-TTS) für die Gesprächspartnerin, wenn ein Schlüssel hinterlegt ist.
// Schlüssel liegt nur lokal in IndexedDB (kv) dieses Geräts und wird NIE synchronisiert.
// Getestet 18.11.2026: CORS für STT und TTS erlaubt (Access-Control-Allow-Origin: *).
import { db } from "./db.js";

const FREE_SECONDS = 5 * 3600; // F0: 5 Std. Spracherkennung pro Monat
const CHUNK_MAX = 50, CHUNK_MIN = 30;

export const azure = {
  key: null,
  region: "swedencentral",
  async init() {
    this.key = await db.kvGet("azureKey", null);
    this.region = (await db.kvGet("azureRegion", null)) || "swedencentral";
  },
  async set(key, region) {
    this.key = (key || "").trim() || null;
    this.region = (region || "").trim() || "swedencentral";
    if (this.key) await db.kvSet("azureKey", this.key);
    else await db.kvDel("azureKey");
    await db.kvSet("azureRegion", this.region);
  },
  has() { return !!this.key; },
  async usage() {
    const u = (await db.kvGet("sttUsage", {})) || {};
    return { seconds: u[monthKey()] || 0, free: FREE_SECONDS };
  },
  async addUsage(sec) {
    const u = (await db.kvGet("sttUsage", {})) || {};
    u[monthKey()] = (u[monthKey()] || 0) + sec;
    await db.kvSet("sttUsage", u);
  },
  /** Verfügbar für Spracherkennung? */
  async available() {
    if (!this.key) return { ok: false, reason: "nokey", msg: "Für die automatische Texterkennung fehlt der Azure-Schlüssel (Mehr → Spracherkennung). Du kannst stattdessen diktieren." };
    if (!navigator.onLine) return { ok: false, reason: "offline", msg: "Offline – die Aufnahme ist gespeichert, die Texterkennung geht erst mit Internet." };
    const u = await this.usage();
    if (u.seconds > u.free - 120) return { ok: false, reason: "limit", msg: "Das kostenlose Monatskontingent (5 Std.) ist fast aufgebraucht – bitte diktieren." };
    return { ok: true };
  },
};

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export class SttError extends Error {
  constructor(reason, msg) { super(msg); this.reason = reason; }
}

// ---------------- Audio → 16 kHz mono PCM ----------------
let ctx = null;
function audioCtx() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!ctx) ctx = new C();
  return ctx;
}

/** Dekodiert eine Aufnahme (mp4/webm) und rechnet sie auf 16 kHz mono um (eigene Umrechnung – überall gleich). */
export async function toPcm16k(blob) {
  const buf = await blob.arrayBuffer();
  const ab = await new Promise((resolve, reject) => {
    const p = audioCtx().decodeAudioData(buf, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
  const n = ab.length, chs = ab.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < chs; c++) { const d = ab.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / chs; }
  const ratio = ab.sampleRate / 16000;
  const outLen = Math.floor(n / ratio);
  const out = new Float32Array(outLen);
  // Mittelwert über das Fenster = einfacher Tiefpass gegen Aliasing
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b && j < n; j++) s += mono[j];
    out[i] = s / (b - a);
  }
  return out;
}

/** Teilt PCM in Stücke ≤ 50 s, geschnitten an der leisesten 0,3-s-Stelle zwischen 30 und 50 s. */
export function splitPcm(pcm, rate = 16000) {
  const parts = [];
  let start = 0;
  const win = Math.round(0.3 * rate);
  while (pcm.length - start > CHUNK_MAX * rate) {
    let best = start + CHUNK_MAX * rate, bestE = Infinity;
    for (let p = start + CHUNK_MIN * rate; p + win < start + CHUNK_MAX * rate; p += Math.round(win / 2)) {
      let e = 0;
      for (let j = p; j < p + win; j += 4) e += pcm[j] * pcm[j];
      if (e < bestE) { bestE = e; best = p + Math.round(win / 2); }
    }
    parts.push({ offset: start / rate, pcm: pcm.subarray(start, best) });
    start = best;
  }
  parts.push({ offset: start / rate, pcm: pcm.subarray(start) });
  return parts;
}

export function wavFromPcm(pcm, rate = 16000) {
  const b = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([b], { type: "audio/wav" });
}

// ---------------- Erkennung ----------------
async function recognizeWav(wav, { reference } = {}) {
  const headers = { "Ocp-Apim-Subscription-Key": azure.key, "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000", Accept: "application/json" };
  let q = "language=de-DE&format=detailed&profanity=raw";
  if (reference) {
    const pa = { ReferenceText: reference, GradingSystem: "HundredMark", Granularity: "Word", EnableMiscue: true };
    headers["Pronunciation-Assessment"] = btoa(unescape(encodeURIComponent(JSON.stringify(pa))));
  } else q += "&wordLevelTimestamps=true";
  let r;
  try {
    r = await fetch(`https://${azure.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${q}`, { method: "POST", headers, body: wav });
  } catch (e) {
    throw new SttError("offline", "Keine Verbindung zur Spracherkennung. Die Aufnahme bleibt gespeichert – bitte erneut versuchen.");
  }
  if (r.status === 401 || r.status === 403) throw new SttError("key", "Der Azure-Schlüssel oder die Region stimmt nicht (Mehr → Spracherkennung).");
  if (r.status === 429) throw new SttError("limit", "Zu viele Anfragen oder Kontingent erschöpft – bitte später erneut versuchen.");
  if (!r.ok) throw new SttError("error", "Spracherkennung fehlgeschlagen (" + r.status + ").");
  return r.json();
}

/**
 * Erkennt eine Aufnahme. Ergebnis: { text, words:[{w,start,end,acc?}], seconds, stats, accuracy? }
 * reference = bekannter Satz (nur beim Nachsprechen) → Aussprache-Werte.
 */
export async function transcribe(blob, { reference, onProgress } = {}) {
  const av = await azure.available();
  if (!av.ok) throw new SttError(av.reason, av.msg);
  const pcm = await toPcm16k(blob);
  const seconds = pcm.length / 16000;
  if (seconds < 0.6) throw new SttError("empty", "Die Aufnahme ist zu kurz.");
  const parts = reference ? [{ offset: 0, pcm: pcm.subarray(0, Math.min(pcm.length, 55 * 16000)) }] : splitPcm(pcm);
  const texts = [], words = [];
  let accuracy = null, done = 0;
  onProgress && onProgress(0, parts.length);
  // Stücke parallel erkennen (max. 3 gleichzeitig), Reihenfolge bleibt erhalten
  const results = new Array(parts.length);
  let next = 0;
  const worker = async () => {
    while (next < parts.length) {
      const i = next++;
      results[i] = await recognizeWav(wavFromPcm(parts[i].pcm), { reference });
      onProgress && onProgress(++done, parts.length);
    }
  };
  await Promise.all([worker(), worker(), worker()].slice(0, parts.length));
  for (let i = 0; i < parts.length; i++) {
    const j = results[i];
    if (!j || j.RecognitionStatus !== "Success") continue; // z. B. Stille in einem Stück
    const nb = j.NBest?.[0];
    texts.push(j.DisplayText || nb?.Display || "");
    if (reference && nb) accuracy = nb.AccuracyScore ?? nb.PronunciationAssessment?.AccuracyScore ?? null;
    for (const w of nb?.Words || []) {
      const acc = w.AccuracyScore ?? w.PronunciationAssessment?.AccuracyScore;
      const err = w.ErrorType ?? w.PronunciationAssessment?.ErrorType;
      words.push({ w: w.Word, start: parts[i].offset + (w.Offset || 0) / 1e7, end: parts[i].offset + ((w.Offset || 0) + (w.Duration || 0)) / 1e7, acc, err });
    }
  }
  await azure.addUsage(seconds);
  const text = texts.join(" ").replace(/([.!?])(?=[A-ZÄÖÜ])/g, "$1 ").replace(/\s+/g, " ").trim();
  if (!text) throw new SttError("empty", "Ich konnte nichts verstehen. Bitte näher ans Mikrofon und noch einmal.");
  return { text, words, seconds, stats: fluency(words, seconds), accuracy };
}

/** Objektive Zeitwerte aus den Wort-Zeitstempeln. */
export function fluency(words, seconds) {
  const ws = words.filter((w) => w.end > w.start);
  if (ws.length < 3) return { wpm: 0, pauses: 0, longest: 0, speech: seconds, words: words.length };
  let pauses = 0, longest = 0;
  for (let i = 1; i < ws.length; i++) {
    const gap = ws[i].start - ws[i - 1].end;
    if (gap > 2) pauses++;
    if (gap > longest) longest = gap;
  }
  const speech = Math.max(1, ws[ws.length - 1].end - ws[0].start);
  return { wpm: Math.round((ws.length / speech) * 60), pauses, longest: Math.round(longest * 10) / 10, speech, words: ws.length };
}

/** Kurzer Satz zur Einordnung der Zeitwerte (für die Lernerin). */
export function fluencyNote(s) {
  if (!s || !s.wpm) return "";
  const tempo = s.wpm < 85 ? "eher langsam – das wird mit Wiederholung flüssiger" : s.wpm <= 175 ? "gutes Sprechtempo" : "sehr schnell – ruhig etwas langsamer";
  const p = s.pauses === 0 ? "keine langen Pausen 👍" : `${s.pauses} Pause${s.pauses > 1 ? "n" : ""} über 2 Sek.` + (s.pauses > 2 ? " – Zeit-gewinnen-Sätze helfen" : "");
  return `${s.wpm} Wörter/Min. (${tempo}) · ${p}`;
}

// ---------------- Live-Stimme (Neural-TTS) ----------------
const VOICES = { A: "de-DE-ConradNeural", B: "de-DE-KatjaNeural", C: "de-DE-AmalaNeural", D: "de-DE-KillianNeural" };
const ttsCache = new Map();

export async function azureTts(text, role = "B") {
  const k = role + "|" + text;
  if (ttsCache.has(k)) return ttsCache.get(k);
  const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const r = await fetch(`https://${azure.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": azure.key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3" },
    body: `<speak version="1.0" xml:lang="de-DE"><voice name="${VOICES[role] || VOICES.B}">${esc}</voice></speak>`,
  });
  if (!r.ok) throw new Error("TTS " + r.status);
  const url = URL.createObjectURL(await r.blob());
  ttsCache.set(k, url);
  return url;
}

/** Testet Schlüssel + Region mit einer winzigen Sprachausgabe. */
export async function testAzure() {
  try {
    await azureTts("Test.", "B");
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: /401|403/.test(e.message) ? "Schlüssel oder Region falsch." : "Keine Verbindung (" + e.message + ")." };
  }
}
