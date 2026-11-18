// Lädt die vorab erzeugten Inhalte (data/*.json). Fehlende Dateien → leere Listen (App bleibt nutzbar).
const FILES = {
  wortschatz: ["wortschatz_a.json", "wortschatz_b.json"],
  redewendungen: ["redewendungen.json"],
  sb: ["sb_a.json", "sb_b.json"],
  drills: ["drills_a.json", "drills_b.json", "drills_c.json", "drills_d.json"],
  grammatik: ["grammatik_a.json", "grammatik_b.json", "grammatik_c.json"],
  lesen: ["lesen_a.json", "lesen_b.json"],
  hoeren: ["hoeren_1.json", "hoeren_2.json", "hoeren_3.json"],
  schreiben: ["schreiben.json", "schreiben_b.json"],
  schreiben_mini: ["schreiben_mini.json"],
  sprechen: ["sprechen.json"],
  sprechtraining: ["sprechen_training.json"],
  strategie: ["strategie.json"],
  links: ["links.json"],
  lernpfad: ["lernpfad.json"],
  einstufung: ["einstufung.json"],
  audio: ["audio/index.json"],
  aufgaben: ["aufgaben.json"],
  aufgaben_spezifisch: ["aufgaben_spezifisch.json"],
};

const cache = new Map();

async function loadFile(f) {
  try {
    const r = await fetch("./data/" + f);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn("Inhalt nicht ladbar:", f, e);
    return null;
  }
}

export async function load(name) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    const parts = await Promise.all(FILES[name].map(loadFile));
    const arrays = parts.filter((x) => Array.isArray(x));
    if (arrays.length) return arrays.flat();
    return parts.find((x) => x && typeof x === "object") || (name === "sprechen" ? { praesentation: [], diskussion: [] } : name === "strategie" ? { karten: [], pruefungstag: [] } : []);
  })();
  cache.set(name, p);
  return p;
}

export async function loadAll() {
  const out = {};
  await Promise.all(Object.keys(FILES).map(async (k) => (out[k] = await load(k))));
  return out;
}

export function allDataFiles() {
  return Object.values(FILES).flat();
}

// Übungspool (ohne die für Probeprüfungen reservierten Items)
export const pool = (arr) => (arr || []).filter((x) => !x.pruefung);
export const reserved = (arr, n) => (arr || []).filter((x) => x.pruefung === n);

export const THEMEN = {
  ki_digitalisierung: "KI & Digitalisierung",
  klima_nachhaltigkeit: "Klima & Nachhaltigkeit",
  gleichberechtigung_diversitaet: "Gleichberechtigung & Diversität",
  bildung_hochschule: "Bildung & Hochschule",
  migration_interkulturalitaet: "Migration & Interkulturalität",
  gesundheit: "Gesundheit",
  arbeitswelt: "Arbeitswelt der Zukunft",
  wissenschaft_ethik: "Wissenschaft & Ethik",
  mobilitaet: "Mobilität",
  wirtschaft: "Wirtschaft",
  medien_desinformation: "Medien & Desinformation",
  demografie: "Demografischer Wandel",
  biotechnologie: "Biotechnologie",
  wohnen_stadt: "Wohnen & Stadt",
  allgemein_akademisch: "Wissenschaftssprache",
};

export const KATEGORIEN = {
  konnektoren: "Konnektoren",
  praepositionen: "Präpositionen",
  rektion: "Verben/Nomen mit Präposition",
  nomen_verb: "Nomen-Verb-Verbindungen",
  passiv: "Passiv & Ersatzformen",
  konjunktiv: "Konjunktiv I & II",
  partizip: "Partizipialattribute",
  relativsatz: "Relativsätze",
  nominalisierung: "Nominalisierung ↔ Verbalisierung",
  deklination: "Deklination",
  pronomen: "Pronomen & Pronominaladverbien",
  wortstellung: "Wortstellung",
  verbformen: "Verbformen & Tempus",
  wortbildung: "Wortbildung",
  wortschatz: "Wortschatz",
  kollokation: "Kollokationen",
  rechtschreibung: "Rechtschreibung",
  // Fehlerarten aus Schreiben/Sprechen/Verstehen
  inhalt: "Inhalt/Aufgabe",
  struktur: "Textaufbau & Kohäsion",
  register: "Register & Stil",
  hoerverstehen: "Hörverstehen",
  leseverstehen: "Leseverstehen",
  redewendung: "Redewendungen",
  aussprache: "Aussprache",
  aufgabe: "Aufgabenstellung verstehen",
};
