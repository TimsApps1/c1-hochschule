// Prüft alle Inhalte in data/ gegen docs/CONTENT_SPEC.md: Schema, IDs, Eindeutigkeit, Mengen, Formatregeln.
// Aufruf: node scripts/validate.mjs   (Exit-Code 1 bei Fehlern)
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [], warns = [];
const E = (f, m) => errors.push(`${f}: ${m}`);
const W = (f, m) => warns.push(`${f}: ${m}`);
const load = (f) => {
  const p = join(root, "data", f);
  if (!existsSync(p)) { W(f, "fehlt"); return null; }
  try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { E(f, "ungültiges JSON: " + e.message); return null; }
};
const words = (t) => (String(t).replace(/\{\d+\}|\[\d+\]/g, "").trim().match(/\S+/g) || []).length;
const KAT = ["konnektoren", "praepositionen", "rektion", "nomen_verb", "passiv", "konjunktiv", "partizip", "relativsatz", "nominalisierung", "deklination", "pronomen", "wortstellung", "verbformen", "wortbildung", "wortschatz", "kollokation", "rechtschreibung"];
const ids = new Map();
const uniq = (f, id) => { if (ids.has(id)) E(f, `doppelte ID ${id} (auch in ${ids.get(id)})`); ids.set(id, f); };
const stats = {};
const count = (k, n = 1) => (stats[k] = (stats[k] || 0) + n);

// Wortschatz
const ws = [...(load("wortschatz_a.json") || []), ...(load("wortschatz_b.json") || [])];
const seenWort = new Set();
for (const w of ws) {
  uniq("wortschatz", w.id);
  for (const k of ["wort", "wortart", "thema", "erklaerung", "beispiel", "luecke"]) if (!w[k]) E("wortschatz", `${w.id} ohne ${k}`);
  const key = String(w.wort).toLowerCase();
  if (seenWort.has(key)) E("wortschatz", `Wort doppelt: ${w.wort}`);
  seenWort.add(key);
  if (w.luecke) {
    if (w.luecke.optionen?.length !== 4) E("wortschatz", `${w.id} luecke braucht 4 Optionen`);
    if (!w.luecke.optionen?.includes(w.luecke.loesung)) E("wortschatz", `${w.id} Lösung nicht in Optionen`);
    if ((w.luecke.satz.match(/___/g) || []).length !== 1) E("wortschatz", `${w.id} Lückensatz braucht genau ein ___`);
  }
  count("Wörter");
}

// Redewendungen
const rw = load("redewendungen.json") || [];
const seenRw = new Set();
for (const r of rw) {
  uniq("redewendungen", r.id);
  if (seenRw.has(r.ausdruck.toLowerCase())) E("redewendungen", `doppelt: ${r.ausdruck}`);
  seenRw.add(r.ausdruck.toLowerCase());
  if (!r.luecke?.optionen?.includes(r.luecke.loesung) || r.luecke.optionen.length !== 4) E("redewendungen", `${r.id} Lücke fehlerhaft`);
  if (r.situation && !(r.situation.loesung >= 0 && r.situation.loesung < r.situation.optionen.length)) E("redewendungen", `${r.id} Situation-Lösung ungültig`);
  count("Redewendungen");
}

// Sprachbausteine
const sb = [...(load("sb_a.json") || []), ...(load("sb_b.json") || [])];
for (const s of sb) {
  uniq("sb", s.id);
  const nums = [...s.text.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
  if (nums.length !== 22 || nums.some((n, i) => n !== i + 1)) E("sb", `${s.id}: Platzhalter {1}…{22} fehlerhaft (${nums.length})`);
  if (s.luecken?.length !== 22) E("sb", `${s.id}: ${s.luecken?.length} Lücken statt 22`);
  const typ = { grammatik: 0, wortschatz: 0, rechtschreibung: 0 };
  for (const g of s.luecken || []) {
    if (g.optionen?.length !== 4 || !(g.loesung >= 0 && g.loesung < 4)) E("sb", `${s.id}#${g.nr} Optionen/Lösung`);
    if (new Set(g.optionen).size !== 4) E("sb", `${s.id}#${g.nr} doppelte Option`);
    if (!KAT.includes(g.kategorie)) E("sb", `${s.id}#${g.nr} unbekannte Kategorie ${g.kategorie}`);
    if (!g.erklaerung) E("sb", `${s.id}#${g.nr} ohne Erklärung`);
    typ[g.typ] = (typ[g.typ] || 0) + 1;
  }
  if (typ.grammatik < 12 || typ.grammatik > 16 || typ.wortschatz < 4 || typ.wortschatz > 8 || typ.rechtschreibung < 1 || typ.rechtschreibung > 4) W("sb", `${s.id} Verteilung ${JSON.stringify(typ)}`);
  const n = words(s.text);
  if (n < 290 || n > 380) W("sb", `${s.id} Textlänge ${n} Wörter`);
  count("SB-Sets");
}

// Drills / Grammatik
const drills = [...(load("drills_a.json") || []), ...(load("drills_b.json") || [])];
for (const d of drills) {
  uniq("drills", d.id);
  if (!KAT.includes(d.kategorie)) E("drills", `${d.id} Kategorie ${d.kategorie}`);
  if (d.typ === "umformung") { if (!d.loesung || !d.ausgang) E("drills", `${d.id} Umformung unvollständig`); }
  else if (d.optionen?.length !== 4 || !(d.loesung >= 0 && d.loesung < 4) || !String(d.satz).includes("___")) E("drills", `${d.id} MC fehlerhaft`);
  count("Drills");
}
const gram = [...(load("grammatik_a.json") || []), ...(load("grammatik_b.json") || [])];
const drillKats = new Set(drills.map((d) => d.kategorie));
for (const k of drillKats) if (!gram.some((g) => g.id === k)) W("grammatik", `keine Erklärung für ${k}`);

// Lesen
const lesen = [...(load("lesen_a.json") || []), ...(load("lesen_b.json") || [])];
for (const l of lesen) {
  uniq("lesen", l.id);
  count("Lesen " + l.teil);
  if (l.teil === "lv1") {
    const gaps = [...l.text.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]);
    if (gaps.join() !== "1,2,3,4,5,6") E("lesen", `${l.id} Lücken ${gaps.join()}`);
    if (l.saetze?.length !== 8) E("lesen", `${l.id} braucht 8 Sätze`);
    const sol = Object.values(l.loesungen || {});
    if (sol.length !== 6 || new Set(sol).size !== 6) E("lesen", `${l.id} Lösungen nicht 6 verschiedene`);
  } else if (l.teil === "lv2") {
    if (l.abschnitte?.length !== 5) E("lesen", `${l.id} braucht 5 Abschnitte`);
    if (l.aussagen?.length !== 6 || l.aussagen.some((a) => !"abcde".includes(a.loesung))) E("lesen", `${l.id} Aussagen fehlerhaft`);
    const n = words(l.abschnitte.map((a) => a.text).join(" "));
    if (n < 600 || n > 900) W("lesen", `${l.id} Länge ${n}`);
  } else if (l.teil === "lv3") {
    if (l.aussagen?.length !== 11) E("lesen", `${l.id} braucht 11 Aussagen`);
    const nit = l.aussagen.filter((a) => a.loesung === "nicht_im_text").length;
    if (nit < 1 || nit > 3) E("lesen", `${l.id} ${nit}× nicht_im_text`);
    if (l.ueberschrift?.optionen?.length !== 3) E("lesen", `${l.id} Überschrift`);
    for (const a of l.aussagen) if (a.beleg && !l.text.includes(a.beleg)) W("lesen", `${l.id}#${a.nr} Beleg nicht im Text`);
  } else E("lesen", `${l.id} unbekannter Teil`);
}

// Hören
const hoeren = [...(load("hoeren_1.json") || []), ...(load("hoeren_2.json") || []), ...(load("hoeren_3.json") || [])];
const spoken = (t) => /\d|\(|\)|z\. ?B\.|usw\.|Prof\.|Dr\./.test(t);
for (const x of hoeren) {
  uniq("hoeren", x.id);
  count("Hören " + x.teil);
  if (x.teil === "hv1") {
    if (x.sprecher?.length !== 8 || x.aussagen?.length !== 10) E("hoeren", `${x.id} 8 Sprecher / 10 Aussagen`);
    const sol = Object.values(x.loesungen || {});
    if (sol.length !== 8 || new Set(sol).size !== 8) E("hoeren", `${x.id} Lösungen`);
    for (const s of x.sprecher) if (spoken(s.text)) W("hoeren", `${x.id} Sprecher ${s.nr}: Ziffer/Abkürzung im Hörtext`);
  } else if (x.teil === "hv2") {
    if (x.items?.length !== 10 || x.items.some((i) => i.optionen?.length !== 3 || !(i.loesung >= 0 && i.loesung < 3))) E("hoeren", `${x.id} Items`);
    for (const s of x.skript) if (spoken(s.text)) { W("hoeren", `${x.id}: Ziffer/Abkürzung im Hörtext`); break; }
  } else if (x.teil === "hv3") {
    const gaps = x.folien?.flatMap((f) => f.punkte.filter((p) => p.luecke)) || [];
    if (gaps.length !== 10) E("hoeren", `${x.id} ${gaps.length} Lücken statt 10`);
    for (const g of gaps) {
      const n = g.loesung.toLowerCase();
      if (!(g.schluesselwoerter || []).every((grp) => grp.some((w) => n.includes(w.toLowerCase())))) E("hoeren", `${x.id}#${g.luecke} Musterlösung erfüllt eigene Schlüsselwörter nicht`);
    }
    for (const s of x.skript) if (spoken(s.text)) { W("hoeren", `${x.id}: Ziffer/Abkürzung im Hörtext`); break; }
  } else E("hoeren", `${x.id} unbekannter Teil`);
}

// Schreiben / Sprechen / Strategie / Links / Lernpfad
const sa = load("schreiben.json") || [];
for (const t of sa) {
  uniq("schreiben", t.id);
  if (t.zitate?.length !== 2) E("schreiben", `${t.id} braucht 2 Zitate`);
  const n = words(t.musterloesung || "");
  if (n < 350) E("schreiben", `${t.id} Musterlösung nur ${n} Wörter`);
  count("Schreibaufgaben");
}
const sp = load("sprechen.json");
if (sp) {
  for (const b of sp.praesentation || []) { uniq("sprechen", b.id); if (b.themen?.length !== 2) E("sprechen", `${b.id} braucht 2 Themen`); count("Präsentationsthemen", b.themen?.length || 0); }
  for (const d of sp.diskussion || []) { uniq("sprechen", d.id); if (!d.zitat) E("sprechen", `${d.id} ohne Zitat`); count("Diskussionsthemen"); }
}
const st = load("strategie.json");
if (st) count("Strategiekarten", st.karten?.length || 0);
const links = load("links.json");
if (links) { for (const l of links) if (!/^https:\/\//.test(l.url)) E("links", `${l.id} URL`); count("Links", links.length); }
const lp = load("lernpfad.json");
if (lp) count("Lernpfad-Tage", lp.length);

// Probeprüfungen vollständig?
for (const n of [1, 2, 3]) {
  const miss = [];
  for (const t of ["lv1", "lv2", "lv3"]) if (!lesen.some((x) => x.teil === t && x.pruefung === n)) miss.push(t);
  if (!sb.some((x) => x.pruefung === n)) miss.push("sb");
  for (const t of ["hv1", "hv2", "hv3"]) if (!hoeren.some((x) => x.teil === t && x.pruefung === n)) miss.push(t);
  if (sa.filter((x) => x.pruefung === n).length !== 2) miss.push("schreiben(2)");
  if (!sp?.praesentation?.some((x) => x.pruefung === n)) miss.push("praesentation");
  if (!sp?.diskussion?.some((x) => x.pruefung === n)) miss.push("diskussion");
  if (miss.length) W("pruefung", `Probeprüfung ${n} unvollständig: ${miss.join(", ")}`);
}

console.log("Mengen:", stats);
if (warns.length) console.log(`\n${warns.length} Warnung(en):\n- ` + warns.join("\n- "));
if (errors.length) { console.log(`\n${errors.length} FEHLER:\n- ` + errors.join("\n- ")); process.exit(1); }
console.log("\n✓ Keine Fehler.");
