// Erzeugt die Audios für das Sprechtraining mit Azure Neural TTS (einmalig, vorhandene werden übersprungen):
//   data/audio/ks01.mp3 … ks26.mp3    Kernsätze zum Nachsprechen (ruhiges, deutliches Tempo)
//   data/audio/kv_<thema>.mp3         gekürzte Mustervorträge für 1B („Zuhörende“)
// und trägt sie in data/audio/index.json ein.
// Schlüssel NIE ins Repo – gelesen aus AZURE_SPEECH_KEY/AZURE_SPEECH_REGION oder %USERPROFILE%\.c1-azure.env (KEY=…, REGION=…).
// Aufruf: node scripts/tts-sprechen.mjs [--force] [--dry-run]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "data", "audio");
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry-run");

function credentials() {
  let key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  const file = join(homedir(), ".c1-azure.env");
  if ((!key || !region) && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(KEY|REGION)\s*=\s*(.+?)\s*$/i);
      if (m && m[1].toUpperCase() === "KEY") key = key || m[2];
      if (m && m[1].toUpperCase() === "REGION") region = region || m[2];
    }
  }
  if (!key || !region) { console.error("Kein Azure-Schlüssel gefunden (~/.c1-azure.env)."); process.exit(1); }
  return { key: key.trim(), region: region.trim().toLowerCase() };
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function synth({ key, region }, body, attempt = 1) {
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "c1-hochschule-tts" },
    body,
  });
  if (r.status === 429 || r.status >= 500) {
    if (attempt > 6) throw new Error("Azure " + r.status);
    await new Promise((res) => setTimeout(res, 5000 * attempt));
    return synth({ key, region }, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`Azure ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

const data = JSON.parse(readFileSync(join(root, "data", "sprechen_training.json"), "utf8"));
const indexFile = join(outDir, "index.json");
const index = JSON.parse(readFileSync(indexFile, "utf8"));
const jobs = [];
const SPEAKERS = ["de-DE-KatjaNeural", "de-DE-ConradNeural"];
data.kernsaetze.forEach((k, i) => {
  const voice = SPEAKERS[i % 2];
  jobs.push({ id: k.id, voice, ssml: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE"><voice name="${voice}"><prosody rate="-8%">${esc(k.text)}</prosody></voice></speak>` });
});
const KV = ["de-DE-AmalaNeural", "de-DE-KillianNeural", "de-DE-LouisaNeural", "de-DE-RalfNeural", "de-DE-TanjaNeural"];
Object.entries(data.geruest).forEach(([id, g], i) => {
  const voice = KV[i % KV.length];
  const paras = g.kurzvortrag.split(/\n\s*\n/).map((p) => esc(p.trim())).filter(Boolean);
  jobs.push({ id: "kv_" + id, voice, ssml: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE"><voice name="${voice}">${paras.join('<break time="700ms"/>')}</voice></speak>` });
});
console.log(jobs.length, "Audios,", jobs.reduce((s, j) => s + j.ssml.length, 0), "Zeichen SSML");
if (DRY) process.exit(0);
const cred = credentials();
for (const j of jobs) {
  const file = j.id + ".mp3";
  if (!FORCE && existsSync(join(outDir, file)) && index[j.id]) continue;
  const buf = await synth(cred, j.ssml);
  writeFileSync(join(outDir, file), buf);
  index[j.id] = { file, bytes: buf.length, voices: { s: j.voice } };
  console.log("✓", j.id, Math.round(buf.length / 1024) + " KB");
}
writeFileSync(indexFile, JSON.stringify(index, null, 1));
console.log("fertig");
