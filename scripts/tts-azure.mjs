// Erzeugt einmalig natürliche MP3-Hörtexte mit Azure Neural TTS für alle Hörverstehen-Aufgaben.
//
// Schlüssel NIE ins Repo! Er wird gelesen aus (1) Umgebungsvariablen AZURE_SPEECH_KEY / AZURE_SPEECH_REGION
// oder (2) der Datei %USERPROFILE%\.c1-azure.env mit zwei Zeilen:
//     KEY=dein-schluessel
//     REGION=westeurope
//
// Aufruf:
//   node scripts/tts-azure.mjs --dry-run        Stimmen-Zuordnung und Zeichenzahl anzeigen (kein API-Aufruf)
//   node scripts/tts-azure.mjs --test           nur einen kurzen Testsatz erzeugen (data/audio/_test.mp3)
//   node scripts/tts-azure.mjs                  alle Hörtexte erzeugen (vorhandene MP3s werden übersprungen)
//   node scripts/tts-azure.mjs --only hv2_03    nur einzelne Aufgabe(n), kommasepariert; --force überschreibt
//
// Ergebnis: data/audio/<id>.mp3 und data/audio/index.json (welche Aufgaben eine MP3 haben, welche Stimmen).
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "data", "audio");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const TEST = args.includes("--test");
const FORCE = args.includes("--force");
const ONLY = (() => { const i = args.indexOf("--only"); return i >= 0 ? new Set(args[i + 1].split(",")) : null; })();

// ---------- Zugangsdaten ----------
function credentials() {
  let key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  const file = process.env.C1_AZURE_FILE || join(homedir(), ".c1-azure.env");
  if ((!key || !region) && existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(KEY|REGION)\s*=\s*(.+?)\s*$/i);
      if (m && m[1].toUpperCase() === "KEY") key = key || m[2];
      if (m && m[1].toUpperCase() === "REGION") region = region || m[2];
    }
  }
  if (!key || !region) {
    console.error(`Kein Azure-Schlüssel gefunden. Lege die Datei ${file} an mit:\nKEY=...\nREGION=westeurope`);
    process.exit(1);
  }
  return { key: key.trim(), region: region.trim().toLowerCase().replace(/\s+/g, "") };
}

// ---------- Stimmen ----------
const FEMALE = ["de-DE-KatjaNeural", "de-DE-AmalaNeural", "de-DE-LouisaNeural", "de-DE-TanjaNeural", "de-DE-MajaNeural", "de-DE-ElkeNeural", "de-DE-KlarissaNeural", "de-AT-IngridNeural"];
const MALE = ["de-DE-ConradNeural", "de-DE-KillianNeural", "de-DE-RalfNeural", "de-DE-KlausNeural", "de-DE-ChristophNeural", "de-DE-BerndNeural", "de-DE-KasperNeural", "de-AT-JonasNeural"];
const NARRATOR = "de-DE-KatjaNeural";

const FEMALE_NAMES = "anna lena sophie sofia julia laura lea leonie marie sarah hannah lisa katharina elif ayse ayşe fatma maria clara klara emma mia johanna nora paula jana svenja petra sabine claudia andrea monika ines miriam nina carla greta aylin amelie charlotte franziska theresa melanie birgit ute heike susanne karin martina stefanie christina elena yasmin zeynep mei ana priya rosa lina emilia ida frieda helena judith eva sandra tanja anja silke kerstin nadine vanessa jasmin selin mariam amira lucia irina olga natalia agnieszka beatrix gabriele renate ulrike barbara jennifer jessica anke britta dana daniela doris esra hatice ilse jutta kathrin lara luisa marlene merve nele pia ronja sina tamara vera wiebke yvonne".split(" ");
const MALE_NAMES = "jonas lukas leon felix paul max maximilian elias noah ben finn tim tom jan niklas david moritz simon julian philipp alexander daniel florian tobias sebastian markus martin thomas michael stefan andreas christian peter klaus jürgen frank uwe ralf bernd wolfgang hans karl ahmed mehmet ali mustafa emre can omar yusuf hassan ibrahim kemal arjun raj wei jose carlos luca marco matteo ivan igor piotr tomasz kai lars nils ole erik henrik johannes jakob benedikt dominik fabian kevin marcel patrick sven torsten volker dirk holger jens joachim lothar rainer reinhard rolf ulrich werner".split(" ");

export function genderOf(name = "") {
  const n = name.toLowerCase();
  if (/\b(frau|moderatorin|professorin|dozentin|studentin|lehrerin|forscherin|ärztin|referentin|journalistin|mitarbeiterin|leiterin|beraterin|sprecherin|expertin|biologin|soziologin|psychologin|ökonomin|wissenschaftlerin|doktorandin|lehramtsstudentin|schülerin|kollegin|präsidentin|direktorin|beauftragte)\b/.test(n)) return "f";
  if (/\b(herr|moderator|professor|dozent|student|lehrer|forscher|arzt|referent|journalist|mitarbeiter|leiter|berater|sprecher|experte|biologe|soziologe|psychologe|ökonom|wissenschaftler|doktorand|lehramtsstudent|schüler|kollege|präsident|direktor)\b/.test(n)) return "m";
  const words = n.replace(/[^a-zäöüßğış ]/g, " ").split(/\s+/);
  if (words.some((w) => FEMALE_NAMES.includes(w))) return "f";
  if (words.some((w) => MALE_NAMES.includes(w))) return "m";
  if (/innen\b|in\b/.test(n)) return "f";
  return null;
}

function assignVoices(item) {
  const used = new Set([NARRATOR]);
  // Je Aufgabe andere Startstimme, damit nicht jeder Hörtext gleich klingt
  const off = parseInt(String(item.id).replace(/\D/g, ""), 10) || 0;
  const rot = (l) => [...l.slice(off % l.length), ...l.slice(0, off % l.length)];
  const pick = (g, idx) => {
    const list = rot(g === "m" ? MALE : g === "f" ? FEMALE : idx % 2 ? MALE : FEMALE);
    return list.find((v) => !used.has(v)) || list[idx % list.length];
  };
  const map = {};
  if (item.teil === "hv1") {
    item.sprecher.forEach((s, i) => { const v = pick(genderOf(s.name), i); used.add(v); map["p" + s.nr] = v; });
  } else {
    (item.rollen || []).forEach((r, i) => {
      if (r.sp === "C" && /moderation/i.test(r.name)) { map[r.sp] = NARRATOR; return; }
      const v = pick(genderOf(r.name), i); used.add(v); map[r.sp] = v;
    });
  }
  return map;
}

const ZAHL = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
function segments(item, voices) {
  if (item.teil === "hv1") {
    return item.sprecher.flatMap((s) => [
      { voice: NARRATOR, text: `Nummer ${ZAHL[s.nr] || s.nr}.`, pauseAfter: 600 },
      { voice: voices["p" + s.nr], text: s.text, pauseAfter: 1200 },
    ]);
  }
  return item.skript.map((s, i, a) => ({ voice: voices[s.sp] || NARRATOR, text: s.text, pauseAfter: a[i + 1] && a[i + 1].sp !== s.sp ? 500 : 250 }));
}

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function ssml(segs) {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">` +
    segs.map((s) => `<voice name="${s.voice}">${esc(s.text)}<break time="${s.pauseAfter}ms"/></voice>`).join("") + `</speak>`;
}
/** In Stücke mit max. ~3500 Zeichen Text teilen (Azure-Grenze: 10 Min. Audio und 50 Stimmen-Wechsel pro Anfrage). */
function chunks(segs, maxChars = 3500, maxVoices = 40) {
  const out = [];
  let cur = [], len = 0;
  for (const s of segs) {
    if (cur.length && (len + s.text.length > maxChars || cur.length >= maxVoices)) { out.push(cur); cur = []; len = 0; }
    cur.push(s); len += s.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function synth({ key, region }, body, attempt = 1) {
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "c1-hochschule-tts" },
    body,
  });
  if (r.status === 429 || r.status >= 500) {
    if (attempt > 6) throw new Error(`Azure ${r.status} nach mehreren Versuchen`);
    const wait = Math.min(60, 5 * attempt);
    console.log(`   … Azure ${r.status}, warte ${wait}s`);
    await new Promise((res) => setTimeout(res, wait * 1000));
    return synth({ key, region }, body, attempt + 1);
  }
  if (!r.ok) throw new Error(`Azure ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function availableVoices({ key, region }) {
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { "Ocp-Apim-Subscription-Key": key } });
  if (r.status === 401) throw new Error("Schlüssel abgelehnt (401) – Schlüssel oder Region prüfen.");
  if (!r.ok) throw new Error(`Stimmenliste nicht abrufbar: ${r.status}`);
  return new Set((await r.json()).map((v) => v.ShortName));
}

// ---------- Ablauf ----------
const items = ["hoeren_1.json", "hoeren_2.json", "hoeren_3.json"].flatMap((f) => JSON.parse(readFileSync(join(root, "data", f), "utf8")));
const todo = items.filter((x) => !ONLY || ONLY.has(x.id));
let totalChars = 0;
const plan = todo.map((item) => {
  const voices = assignVoices(item);
  const segs = segments(item, voices);
  const chars = segs.reduce((s, x) => s + x.text.length, 0);
  totalChars += chars;
  return { item, voices, segs, chars };
});

if (DRY) {
  for (const p of plan) console.log(`${p.item.id.padEnd(7)} ${String(p.chars).padStart(6)} Zeichen  ${Object.entries(p.voices).map(([k, v]) => `${k}=${v.replace(/-?Neural$/, "").replace(/^de-/, "")}`).join(" ")}`);
  console.log(`\nGesamt: ${totalChars} Zeichen (Azure F0: 500.000 Zeichen/Monat frei). ${plan.length} Hörtexte.`);
  process.exit(0);
}

const cred = credentials();
mkdirSync(outDir, { recursive: true });
const ok = await availableVoices(cred);
const fallback = (v) => (ok.has(v) ? v : ok.has(NARRATOR) ? NARRATOR : [...ok].find((x) => x.startsWith("de-DE")));
console.log(`Verbindung ok (${cred.region}), ${[...ok].filter((v) => v.startsWith("de-")).length} deutsche Stimmen verfügbar.`);

if (TEST) {
  const buf = await synth(cred, ssml([{ voice: fallback("de-DE-KatjaNeural"), text: "Hallo! Ich bin Katja. So klingen die neuen Hörtexte.", pauseAfter: 300 }, { voice: fallback("de-DE-ConradNeural"), text: "Und ich bin Conrad. Viel Erfolg bei der Prüfung!", pauseAfter: 100 }]));
  writeFileSync(join(outDir, "_test.mp3"), buf);
  console.log("Test gespeichert: data/audio/_test.mp3");
  process.exit(0);
}

const indexFile = join(outDir, "index.json");
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : {};
let n = 0;
for (const p of plan) {
  const file = join(outDir, `${p.item.id}.mp3`);
  if (existsSync(file) && !FORCE && index[p.item.id]) { console.log(`✓ ${p.item.id} vorhanden`); continue; }
  for (const s of p.segs) s.voice = fallback(s.voice);
  const parts = [];
  const cs = chunks(p.segs);
  for (const [i, c] of cs.entries()) {
    process.stdout.write(`→ ${p.item.id} Teil ${i + 1}/${cs.length} … `);
    parts.push(await synth(cred, ssml(c)));
    console.log("ok");
    await new Promise((res) => setTimeout(res, 1500)); // F0: höflich bleiben
  }
  writeFileSync(file, Buffer.concat(parts));
  index[p.item.id] = { file: `${p.item.id}.mp3`, bytes: statSync(file).size, voices: Object.fromEntries(Object.entries(p.voices).map(([k, v]) => [k, fallback(v)])) };
  writeFileSync(indexFile, JSON.stringify(index, null, 1));
  n++;
}
console.log(`\nFertig: ${n} neue MP3-Dateien, ${Object.keys(index).length} insgesamt. Zeichen in diesem Lauf: ca. ${totalChars}.`);
