// Sprachaufnahme mit MediaRecorder (Safari: audio/mp4), damit die Lernerin sich selbst anhören kann
// und die Aufnahme danach erkannt werden kann (azure.js).
// Schutz gegen Verlust:
// - Bildschirm-Wachhalten (Screen Wake Lock) während der Aufnahme, wo verfügbar.
// - Alle 4 s werden die bisherigen Teile in IndexedDB gesichert („rec:live“). Bricht iOS die Aufnahme ab
//   (Sperre, App im Hintergrund), bleibt das bisher Gesprochene erhalten und kann wiederhergestellt werden.
// Aufnahmen bleiben auf dem Gerät (kein Upload außer zur Spracherkennung, kein Sync).
import { db } from "./db.js";

export function recorderSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (_) { /* nicht unterstützt → Hinweis in der Oberfläche */ }
}
export function wakeLockSupported() {
  return "wakeLock" in navigator;
}

export class Recorder {
  constructor({ tag = "" } = {}) {
    this.rec = null;
    this.chunks = [];
    this.stream = null;
    this.url = null;
    this.blob = null;
    this.startedAt = 0;
    this.duration = 0;
    this.tag = tag;
    this.saveIv = null;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.blob = null;
    this.rec.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.startedAt = Date.now();
    keepAwake(true);
    this.saveIv = setInterval(() => this.backup(), 4000);
  }
  async backup() {
    if (!this.chunks.length) return;
    try {
      await db.kvSet("rec:live", { t: this.startedAt, tag: this.tag, type: this.rec?.mimeType || "audio/mp4", chunks: [...this.chunks] });
    } catch (_) {}
  }
  get recording() {
    return !!this.rec && this.rec.state === "recording";
  }
  get seconds() {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }
  /** Stoppt und liefert die Blob-URL; this.blob enthält die Aufnahme. */
  stop() {
    return new Promise((resolve) => {
      clearInterval(this.saveIv);
      keepAwake(false);
      const finish = () => {
        this.blob = new Blob(this.chunks, { type: this.rec?.mimeType || "audio/mp4" });
        this.duration = this.seconds;
        this.startedAt = 0;
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(this.blob);
        this.stream?.getTracks().forEach((t) => t.stop());
        db.kvDel("rec:live").catch(() => {});
        resolve(this.url);
      };
      if (!this.rec || this.rec.state === "inactive") return this.chunks.length ? finish() : resolve(this.url);
      this.rec.onstop = finish;
      try { this.rec.stop(); } catch (_) { finish(); }
    });
  }
}

/** Unterbrochene Aufnahme (z. B. Bildschirmsperre) – falls vorhanden und jünger als 6 Std. */
export async function interruptedRecording() {
  const r = await db.kvGet("rec:live", null);
  if (!r || !r.chunks?.length || Date.now() - r.t > 6 * 3600e3) return null;
  return { t: r.t, tag: r.tag, blob: new Blob(r.chunks, { type: r.type }) };
}
export function clearInterrupted() {
  return db.kvDel("rec:live").catch(() => {});
}

// Dauerhafte Aufnahmen (z. B. die erste Aufnahme je Thema/Abschnitt zum späteren Vergleich)
export async function keepRecording(id, blob, meta = {}) {
  try { await db.kvSet("rec:" + id, { t: Date.now(), blob, ...meta }); } catch (_) {}
}
export async function getRecording(id) {
  try { return await db.kvGet("rec:" + id, null); } catch (_) { return null; }
}
