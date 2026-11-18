// Vorlesen über die Web Speech API (auf dem iPhone: deutsche iOS-Stimmen wie „Anna“, „Helena“, „Martin“ …).
// Mehrere Sprecher: Rolle A/B/C → je eine Stimme aus den Einstellungen; gibt es nur eine deutsche Stimme,
// unterscheiden sich die Sprecher über die Tonhöhe.
// iOS-Eigenheiten: Stimmen laden asynchron; lange Äußerungen brechen manchmal ab → wir lesen satzweise;
// pause()/resume() ist unzuverlässig → Pause = Stopp und Fortsetzen ab dem aktuellen Satz.
import { store } from "./store.js";
import { azure, azureTts, wavFromPcm } from "./azure.js";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

export function ttsSupported() {
  return !!synth && typeof SpeechSynthesisUtterance !== "undefined";
}

let voicesCache = [];
export function germanVoices() {
  if (!synth) return [];
  const v = synth.getVoices().filter((x) => /^de([-_]|$)/i.test(x.lang));
  if (v.length) voicesCache = v;
  return voicesCache;
}
export function voicesReady() {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    if (germanVoices().length) return resolve(germanVoices());
    const done = () => resolve(germanVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

function pickVoice(role) {
  const vs = germanVoices();
  if (!vs.length) return { voice: null, pitch: 1 };
  const s = store.settings;
  const wanted = { A: s.ttsVoiceA, B: s.ttsVoiceB, C: s.ttsVoiceC }[role] || "";
  let v = vs.find((x) => x.voiceURI === wanted || x.name === wanted);
  const idx = { A: 0, B: 1, C: 2, D: 3 }[role] ?? 0;
  if (!v) {
    // Standard: unterschiedliche Stimmen, „Enhanced/Premium“ bevorzugt
    const sorted = [...vs].sort((a, b) => quality(b) - quality(a));
    v = sorted[idx % sorted.length];
  }
  const distinct = new Set(vs.map((x) => x.name)).size;
  const pitch = distinct >= idx + 1 ? 1 : [1, 0.82, 1.18, 0.95][idx];
  return { voice: v, pitch };
}
function quality(v) {
  return (/premium/i.test(v.name) || /premium/i.test(v.voiceURI) ? 3 : 0) + (/enhanced|erweitert/i.test(v.name + v.voiceURI) ? 2 : 0) + (v.localService ? 1 : 0) + (/de-DE/i.test(v.lang) ? 0.5 : 0);
}

/** Zerlegt Text in Sätze (für robustes Vorlesen auf iOS). */
export function sentences(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .match(/[^.!?…]+(?:[.!?…]+["“”»]?|$)/g)
    ?.map((s) => s.trim())
    .filter(Boolean) || [];
}

/**
 * Spieler für ein Skript: segments = [{sp:"A", name:"Prof. Weber", text:"…"}].
 * Ereignisse: onSegment(i), onEnd(), onState(state)
 */
export class ScriptPlayer {
  constructor(segments, { rate, onSegment, onEnd, onState } = {}) {
    this.queue = [];
    segments.forEach((seg, i) => sentences(seg.text).forEach((t) => this.queue.push({ seg: i, sp: seg.sp || "A", text: t })));
    this.rate = rate || store.settings.ttsRate || 1;
    this.pos = 0;
    this.state = "idle";
    this.onSegment = onSegment;
    this.onEnd = onEnd;
    this.onState = onState;
    this.token = 0;
  }
  setState(s) { this.state = s; this.onState && this.onState(s); }
  get progress() { return this.queue.length ? this.pos / this.queue.length : 0; }

  play() {
    if (!ttsSupported()) return;
    if (this.state === "playing") return;
    if (this.pos >= this.queue.length) this.pos = 0;
    synth.cancel();
    this.setState("playing");
    this.speakNext(++this.token);
  }
  speakNext(token) {
    if (token !== this.token) return;
    if (this.pos >= this.queue.length) {
      this.setState("ended");
      this.onEnd && this.onEnd();
      return;
    }
    const item = this.queue[this.pos];
    const u = new SpeechSynthesisUtterance(item.text);
    const { voice, pitch } = pickVoice(item.sp);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "de-DE";
    u.pitch = pitch;
    u.rate = this.rate;
    this.onSegment && this.onSegment(item.seg);
    u.onend = () => {
      if (token !== this.token) return;
      this.pos++;
      // kurze Pause bei Sprecherwechsel
      const next = this.queue[this.pos];
      setTimeout(() => this.speakNext(token), next && next.sp !== item.sp ? 450 : 60);
    };
    u.onerror = (e) => {
      if (token !== this.token) return;
      if (e.error === "interrupted" || e.error === "canceled") return;
      this.pos++;
      this.speakNext(token);
    };
    synth.speak(u);
  }
  pause() {
    if (this.state !== "playing") return;
    this.token++;
    synth.cancel();
    this.setState("paused");
  }
  stop() {
    this.token++;
    if (synth) synth.cancel();
    this.pos = 0;
    this.setState("idle");
  }
  back(n = 2) {
    const wasPlaying = this.state === "playing";
    this.pause();
    this.pos = Math.max(0, this.pos - n);
    if (wasPlaying) this.play();
  }
  setRate(r) {
    this.rate = r;
    if (this.state === "playing") { this.pause(); this.play(); }
  }
}

// Ein gemeinsames <audio>-Element: iOS erlaubt Abspielen nach einem await nur, wenn das Element
// vorher einmal durch eine Berührung „freigeschaltet“ wurde.
let shared = null;
function sharedAudio() {
  if (!shared) {
    shared = new Audio();
    shared.preload = "auto";
    const unlock = () => {
      shared.src = URL.createObjectURL(wavFromPcm(new Float32Array(1600), 16000));
      shared.play().then(() => shared.pause()).catch(() => {});
      document.removeEventListener("pointerdown", unlock, true);
    };
    document.addEventListener("pointerdown", unlock, true);
  }
  return shared;
}
if (typeof document !== "undefined") sharedAudio();

/** Spielt eine Audio-URL über das freigeschaltete Element; Promise endet nach dem Abspielen. */
export function playUrl(url) {
  const a = sharedAudio();
  stopAll();
  return new Promise((resolve) => {
    a.onended = () => resolve(true);
    a.onpause = () => resolve(true); // auch beim Abbrechen (stopAll) weiter
    a.onerror = () => resolve(false);
    a.src = url;
    a.play().catch(() => resolve(false));
  });
}

/**
 * Liest einen kurzen Text vor. Mit Azure-Schlüssel: natürliche Neural-Stimme (live), sonst iOS-Stimme.
 * Gibt ein Promise zurück, das nach dem Vorlesen endet (beim Web-Speech-Rückfall ungefähr).
 */
export async function speakOnce(text, role = "A") {
  if (!text) return;
  if (azure.has() && navigator.onLine) {
    try {
      const url = await azureTts(text, role);
      if (await playUrl(url)) return true;
    } catch (_) { /* Rückfall: iOS-Stimme */ }
  }
  if (!ttsSupported()) return;
  const p = new ScriptPlayer([{ sp: role, text }]);
  p.play();
  await new Promise((r) => setTimeout(r, Math.min(30000, 400 + text.length * 65)));
}

export function stopAll() {
  if (synth) synth.cancel();
  if (shared && !shared.paused) shared.pause();
}
