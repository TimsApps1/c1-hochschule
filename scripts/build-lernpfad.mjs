// Erzeugt data/lernpfad.json (30 Tage vom 12.11. bis 11.12.2026, Prüfung am 12.12.).
// Aufruf: node scripts/build-lernpfad.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const G = (kategorie) => ({ typ: "grammatik", kategorie });
const ST = (teil) => ({ typ: "strategie", teil });
const SB = (modus = "uebung") => ({ typ: "sb", modus });
const LV = (teil, modus = "uebung") => ({ typ: "lesen", teil, modus });
const HV = (teil, modus = "uebung") => ({ typ: "hoeren", teil, modus });
const SA = (modus = "uebung") => ({ typ: "schreiben", modus });
const SP = (teil) => ({ typ: "sprechen", teil });
const AUTO = { typ: "auto" };

const tage = [
  // Woche 1 – Format kennenlernen, Strategien, Grammatik-Grundpfeiler, erste Texte
  { titel: "Start: Wo stehe ich?", schritte: [{ typ: "einstufung" }, ST("ueberblick")], hinweis: "Heute nur der Einstufungstest (ca. 25 Min.) – er legt deine Schwerpunkte fest." },
  { titel: "Konnektoren & Sprachbausteine", schritte: [ST("sb"), G("konnektoren"), SB(), HV("hv1")] },
  { titel: "Präpositionen & Lesen Teil 1", schritte: [G("praepositionen"), SB(), ST("lv1"), LV("lv1")] },
  { titel: "Der erste eigene Text", schritte: [G("rektion"), ST("schreiben"), SA()], hinweis: "Ohne Zeitdruck schreiben. Nutze den Redemittel-Baukasten." },
  { titel: "Passiv & Hören Teil 2", schritte: [G("passiv"), SB(), ST("hv2"), HV("hv2")] },
  { titel: "Nomen-Verb-Verbindungen & Präsentieren", schritte: [G("nomen_verb"), ST("lv2"), LV("lv2"), ST("sprechen_1a"), SP("1a")] },
  { titel: "Relativsätze & Vorlesungen", schritte: [G("relativsatz"), ST("hv3"), ST("notizen"), HV("hv3"), { typ: "fehler" }] },
  // Woche 2 – Vertiefung, Teilprüfungen unter Zeitdruck, erste Präsentation
  { titel: "Konjunktiv & SB unter Zeitdruck", schritte: [G("konjunktiv"), SB("pruefung"), ST("lv3"), LV("lv3")] },
  { titel: "Nominalisierung & Schreiben", schritte: [G("nominalisierung"), SA(), HV("hv1", "pruefung")] },
  { titel: "Partizipien & Prüfungstempo", schritte: [G("partizip"), SB("pruefung"), HV("hv2", "pruefung"), LV("lv1", "pruefung")] },
  { titel: "Präsentation mit Anschlussfrage", schritte: [G("deklination"), SP("1a"), { typ: "redewendungen" }] },
  { titel: "Pronomen & Lesen/Hören", schritte: [G("pronomen"), LV("lv2", "pruefung"), HV("hv3", "pruefung")] },
  { titel: "Schreiben in 70 Minuten", schritte: [G("wortstellung"), SA("pruefung")], hinweis: "Wie in der Prüfung: 10 Min. planen, 50 Min. schreiben, 10 Min. korrigieren." },
  { titel: "Teiltest Lesen + Sprachbausteine", schritte: [ST("zeitmanagement"), { typ: "teiltest", bereich: "lesen_sb" }], hinweis: "90 Minuten am Stück – wie in der Prüfung." },
  // Woche 3 – volle Teiltests, gezielte Fehlerarbeit, Diskussion mit KI
  { titel: "Teiltest Hören", schritte: [{ typ: "teiltest", bereich: "hoeren" }, { typ: "fehler" }] },
  { titel: "Diskutieren mit der KI-Partnerin", schritte: [ST("sprechen_2"), SP("2"), AUTO] },
  { titel: "Schreiben & Schwachstellen", schritte: [SA("pruefung"), AUTO] },
  { titel: "Lesen/SB komplett + Präsentation", schritte: [{ typ: "teiltest", bereich: "lesen_sb" }, SP("1a")] },
  { titel: "Hören komplett + Diskussion", schritte: [{ typ: "teiltest", bereich: "hoeren" }, SP("2")] },
  { titel: "Schreiben & Sprachbausteine", schritte: [SA("pruefung"), SB("pruefung")] },
  { titel: "Fehler-Marathon", schritte: [AUTO, AUTO, { typ: "fehler" }], hinweis: "Heute zählt nur eins: deine häufigsten Fehler." },
  // Woche 4 – Generalproben, Wiederholung, Strategie
  { titel: "Schwachstellen & Zeitmanagement", schritte: [ST("zeitmanagement"), AUTO, { typ: "fehler" }] },
  { titel: "Mündlich in Form bringen", schritte: [SP("1a"), SP("2"), { typ: "redewendungen" }] },
  { titel: "Generalprobe 1", schritte: [{ typ: "generalprobe", nr: 1 }], hinweis: "Samstag: komplette Probeprüfung mit Originalzeiten (ca. 4,5 Std. inkl. Pause). Du kannst zwischen den Teilen pausieren." },
  { titel: "Auswertung Generalprobe 1", schritte: [{ typ: "fehler" }, AUTO, AUTO] },
  { titel: "Gezielt nachschärfen", schritte: [AUTO, SA("pruefung")] },
  { titel: "Generalprobe 2 – schriftlich", schritte: [{ typ: "generalprobe", nr: 2, teil: "schriftlich" }], hinweis: "Plane dir heute Zeit ein (ca. 3,5 Std.). Wenn das nicht geht: Teile auf heute und morgen verteilen." },
  { titel: "Generalprobe 2 – mündlich", schritte: [{ typ: "generalprobe", nr: 2, teil: "muendlich" }, { typ: "fehler" }] },
  { titel: "Leicht: Wiederholen", schritte: [{ typ: "redewendungen" }, ST("ueberblick"), { typ: "fehler" }], hinweis: "Nur noch wiederholen – nichts Neues." },
  { titel: "Leicht: Bereit für morgen", schritte: [{ typ: "checkliste" }, { typ: "redewendungen" }], hinweis: "Kurz und entspannt. Tasche packen, früh schlafen. Du schaffst das! 💪" },
];

const start = new Date(2026, 10, 12);
const out = tage.map((t, i) => {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { tag: i + 1, datum, woche: Math.min(4, Math.floor(i / 7) + 1), ...t };
});
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(join(root, "data", "lernpfad.json"), JSON.stringify(out, null, 1));
console.log("lernpfad.json:", out.length, "Tage, letzter Tag", out.at(-1).datum);
