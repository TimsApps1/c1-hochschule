// Wiedergabe vorab erzeugter MP3-Hörtexte (Azure-Neuralstimmen), gleiche Schnittstelle wie ScriptPlayer in tts.js.
// Die Datei wird per fetch() geladen (vom Service Worker gecacht → offline) und als Blob abgespielt –
// so funktionieren Spulen und Tempo auch auf dem iPhone zuverlässig.
import { load } from "./content.js";

let indexPromise = null;
export async function audioIndex() {
  if (!indexPromise) indexPromise = load("audio").then((x) => (x && !Array.isArray(x) ? x : {})).catch(() => ({}));
  return indexPromise;
}
export async function audioFor(id) {
  const idx = await audioIndex();
  return idx[id] ? "./data/audio/" + idx[id].file : null;
}

export class FilePlayer {
  constructor(url, { rate = 1, onEnd, onState, onProgress } = {}) {
    this.url = url;
    this.rate = rate;
    this.onEnd = onEnd;
    this.onState = onState;
    this.onProgress = onProgress;
    this.state = "idle";
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.ready = null;
    this.audio.addEventListener("timeupdate", () => this.onProgress && this.onProgress(this.progress));
    this.audio.addEventListener("ended", () => { this.setState("ended"); this.onEnd && this.onEnd(); });
  }
  get progress() {
    return this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
  }
  setState(s) { this.state = s; this.onState && this.onState(s); }
  async prepare() {
    if (!this.ready) {
      this.setState("loading");
      this.ready = fetch(this.url)
        .then((r) => { if (!r.ok) throw new Error("Audio nicht ladbar (" + r.status + ")"); return r.blob(); })
        .then((b) => { this.audio.src = URL.createObjectURL(b); this.setState("idle"); })
        .catch((e) => { this.ready = null; this.setState("error"); throw e; });
    }
    return this.ready;
  }
  async play() {
    await this.prepare();
    if (this.state === "ended") this.audio.currentTime = 0;
    this.audio.playbackRate = this.rate;
    this.audio.preservesPitch = true;
    await this.audio.play();
    this.setState("playing");
  }
  pause() {
    if (this.state !== "playing") return;
    this.audio.pause();
    this.setState("paused");
  }
  stop() {
    this.audio.pause();
    try { this.audio.currentTime = 0; } catch (_) {}
    if (this.state !== "loading") this.setState("idle");
  }
  back(sec = 6) {
    this.audio.currentTime = Math.max(0, this.audio.currentTime - sec);
  }
  setRate(r) {
    this.rate = r;
    this.audio.playbackRate = r;
  }
  destroy() {
    this.stop();
    if (this.audio.src.startsWith("blob:")) URL.revokeObjectURL(this.audio.src);
  }
}
