// Sprachaufnahme mit MediaRecorder (Safari: audio/mp4), damit die Lernerin sich selbst anhören kann.
// Aufnahmen bleiben nur im Speicher dieser Sitzung (kein Upload, kein Sync).

export function recorderSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export class Recorder {
  constructor() {
    this.rec = null;
    this.chunks = [];
    this.stream = null;
    this.url = null;
    this.startedAt = 0;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.startedAt = Date.now();
  }
  get recording() {
    return !!this.rec && this.rec.state === "recording";
  }
  get seconds() {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === "inactive") return resolve(this.url);
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || "audio/mp4" });
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(blob);
        this.stream.getTracks().forEach((t) => t.stop());
        resolve(this.url);
      };
      this.rec.stop();
    });
  }
}
