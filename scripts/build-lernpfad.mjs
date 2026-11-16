// Erzeugt data/lernpfad.json – verdichteter Lernpfad mit 20 Tagen (Wunsch der Lernerin: mehr pro Tag, viel schreiben).
// Tag 1–4 sind unverändert (bereits erledigt), Tag 5 beginnt mit denselben vier Schritten wie vorher (heute begonnen).
// Danach Endspurt bis zur Prüfung am 12.12. (adaptive Tagessessions, siehe js/session.js).
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
const MINI = (art) => ({ typ: "schreiben_mini", art });
const SP = (teil) => ({ typ: "sprechen", teil });
const AUTO = { typ: "auto" };

const tage = [
  // Phase 1 – Format, Strategien, Grammatik-Grundpfeiler (Tag 1–4 unverändert)
  { phase: 1, titel: "Start: Wo stehe ich?", schritte: [{ typ: "einstufung" }, ST("ueberblick")], hinweis: "Heute nur der Einstufungstest (ca. 25 Min.) – er legt deine Schwerpunkte fest." },
  { phase: 1, titel: "Konnektoren & Sprachbausteine", schritte: [ST("sb"), G("konnektoren"), SB(), HV("hv1")] },
  { phase: 1, titel: "Präpositionen & Lesen Teil 1", schritte: [G("praepositionen"), SB(), ST("lv1"), LV("lv1")] },
  { phase: 1, titel: "Der erste eigene Text", schritte: [G("rektion"), ST("schreiben"), SA()], hinweis: "Ohne Zeitdruck schreiben. Nutze den Redemittel-Baukasten." },
  { phase: 1, titel: "Passiv, Hören 2 & Schreiben", schritte: [G("passiv"), SB(), ST("hv2"), HV("hv2"), MINI("zitate"), SA()], hinweis: "Neu: Kurz-Schreibübung – die beiden Zitate mit eigenen Worten wiedergeben. Das bringt viele Punkte." },
  { phase: 1, titel: "Nomen-Verb-Verbindungen, Lesen 2 & Präsentieren", schritte: [G("nomen_verb"), ST("lv2"), LV("lv2"), ST("sprechen_1a"), SP("1a"), MINI("einleitung")] },
  { phase: 1, titel: "Relativsätze, Vorlesungen & Schreiben", schritte: [G("relativsatz"), ST("hv3"), ST("notizen"), HV("hv3"), MINI("argument"), SA()] },
  // Phase 2 – Vertiefung, Prüfungstempo, viel Schreiben
  { phase: 2, titel: "Konjunktiv, SB unter Zeitdruck & Lesen 3", schritte: [G("konjunktiv"), SB("pruefung"), ST("lv3"), LV("lv3"), MINI("gegenargument")] },
  { phase: 2, titel: "Nominalisierung & 70 Minuten Schreiben", schritte: [G("nominalisierung"), MINI("umformen"), HV("hv1", "pruefung"), SA("pruefung")], hinweis: "Wie in der Prüfung: 10 Min. planen, 50 Min. schreiben, 10 Min. korrigieren." },
  { phase: 2, titel: "Partizipien & Prüfungstempo", schritte: [G("partizip"), SB("pruefung"), HV("hv2", "pruefung"), LV("lv1", "pruefung"), MINI("schluss")] },
  { phase: 2, titel: "Teiltest Lesen + SB & Präsentation", schritte: [ST("zeitmanagement"), { typ: "teiltest", bereich: "lesen_sb" }, SP("1a")], hinweis: "90 Minuten am Stück – wie in der Prüfung." },
  { phase: 2, titel: "Deklination, Diskussion & Schreiben", schritte: [G("deklination"), ST("sprechen_2"), SP("2"), MINI("zitate"), SA()] },
  { phase: 2, titel: "Pronomen & Teiltest Hören", schritte: [G("pronomen"), { typ: "teiltest", bereich: "hoeren" }, MINI("einleitung")] },
  { phase: 2, titel: "Verbformen & 70 Minuten Schreiben", schritte: [G("verbformen"), MINI("gegenargument"), SA("pruefung"), AUTO] },
  // Phase 3 – Teiltests, Schwachstellen, Generalproben
  { phase: 3, titel: "Wortstellung, Lesen & Hören im Prüfungsmodus", schritte: [G("wortstellung"), LV("lv2", "pruefung"), HV("hv3", "pruefung"), SP("2"), MINI("argument")] },
  { phase: 3, titel: "Schwachstellen & Schreiben", schritte: [AUTO, AUTO, MINI("umformen"), SA(), { typ: "fehler" }], hinweis: "Heute zählt: deine häufigsten Fehler und ein ganzer Text." },
  { phase: 3, titel: "Generalprobe 1", schritte: [{ typ: "generalprobe", nr: 1 }], hinweis: "Komplette Probeprüfung mit Originalzeiten (ca. 4,5 Std. inkl. Pause). Du kannst zwischen den Teilen pausieren." },
  { phase: 3, titel: "Auswertung & 70 Minuten Schreiben", schritte: [{ typ: "fehler" }, AUTO, MINI("schluss"), SA("pruefung")] },
  { phase: 3, titel: "Generalprobe 2 – schriftlich", schritte: [{ typ: "generalprobe", nr: 2, teil: "schriftlich" }], hinweis: "Plane ca. 3,5 Std. ein. Wenn das nicht geht: Teile auf heute und morgen verteilen." },
  { phase: 3, titel: "Generalprobe 2 – mündlich & Abschluss", schritte: [{ typ: "generalprobe", nr: 2, teil: "muendlich" }, { typ: "fehler" }, MINI("einleitung")], hinweis: "Letzter Tag des Lernpfads! Danach geht es mit dem Endspurt weiter." },
];

const start = new Date(2026, 10, 12);
const out = tage.map((t, i) => {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { tag: i + 1, datum, woche: t.phase, ...t };
});
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(join(root, "data", "lernpfad.json"), JSON.stringify(out, null, 1));
const schreiben = out.reduce((n, d) => n + d.schritte.filter((s) => s.typ === "schreiben" || s.typ === "schreiben_mini").length, 0);
console.log("lernpfad.json:", out.length, "Tage, letzter Tag", out.at(-1).datum, "· Schreibschritte:", schreiben);
