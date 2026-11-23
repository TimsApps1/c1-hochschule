// „🎤 Heute sprechen“ – geführtes tägliches Sprechtraining (Konzept: docs/SPRECHEN_KONZEPT.md, v2).
// Der Kalender bestimmt die Phase (nicht Freigabe-Kriterien):
//   bis 25.11.  A Kernsätze nachsprechen + B/C Präsentation Abschnitt für Abschnitt (eigene Themen, Gerüst aus den Leitpunkten)
//   26.11.–2.12. A + D ganze Präsentation (10 Min. Vorbereitung) mit 1B in beiden Rollen ↔ E Diskussion (abwechselnd)
//   ab 3.12.    F kompletter Durchlauf (20 Min. Vorbereitung, ca. 50 Min.) ↔ A + E (abwechselnd)
// Fortschritt (Themen, Abschnitte, Notizen) wird als „Text“ gespeichert → synchronisiert zwischen iPhone und iPad.
// Aufnahmen bleiben auf dem Gerät; die erste Aufnahme je Abschnitt wird zum späteren Vergleich aufgehoben.
import { h, clear, toast, confetti } from "./ui.js";
import { store, dayKey } from "./store.js";
import { ai, S, AiUnavailable, learnerContext } from "./ai.js";
import { load, pool } from "./content.js";
import { audioFor } from "./audio.js";
import { speakOnce, stopAll, playUrl } from "./tts.js";
import { mascot, tarsiSays, thinking } from "./mascot.js";
import { speakBox, azureHint } from "./speakbox.js";
import { fluencyNote } from "./azure.js";
import { keepRecording, getRecording } from "./recorder.js";
import { praesentation, diskussion } from "./sprechen.js";

const PHASE2 = "2026-11-26", PHASE3 = "2026-12-03";
export function sprechPhase(d = dayKey()) {
  return d < PHASE2 ? 1 : d < PHASE3 ? 2 : 3;
}

// ---------- Stand (synchronisiert) ----------
function stand() {
  const s = store.texts.get("sprechstand");
  return { themen: [], abschnitte: {}, voll: {}, kennen: 0, ks: 0, sessions: 0, ...(s || {}) };
}
async function saveStand(st) {
  await store.saveText({ ...st, id: "sprechstand", typ: "sprechstand" });
}
function notes(themaId) {
  return store.texts.get("notizen-" + themaId)?.notes || {};
}
async function saveNote(themaId, idx, text) {
  const n = { ...notes(themaId), [idx]: text };
  await store.saveText({ id: "notizen-" + themaId, typ: "sprechnotizen", themaId, notes: n });
}

async function themenListe() {
  const sp = await load("sprechen");
  const out = [];
  for (const b of pool(sp.praesentation)) b.themen.forEach((t, i) => out.push({ id: `${b.id}-${i}`, blatt: b, idx: i, thema: t }));
  return out;
}

// ---------- Zurücksetzen (z. B. nach einem Testlauf) ----------
/** Was würde gelöscht? */
export function heuteSprechenInfo() {
  const heute = dayKey();
  // NUR Einträge aus „Heute sprechen“ – normale Sprechübungen (z. B. aus dem Lernpfad) bleiben erhalten
  const TRAINING = ["kernsatz", "abschnitt", "training", "1b-zuhoeren"];
  const atts = store.attempts.filter((a) => a.modul === "sprechen" && a.day === heute && (TRAINING.includes(a.teil) || a.meta?.training));
  const st = store.texts.get("sprechstand");
  return { atts, themen: st?.themen?.length || 0 };
}
/** Löscht das heutige Sprechtraining: Einträge von heute, gewählte Themen, Fortschritt, Notizen, Aufnahmen auf diesem Gerät. */
export async function heuteSprechenZuruecksetzen() {
  const { atts } = heuteSprechenInfo();
  await store.deleteAttempts(atts.map((a) => a.id));
  await saveStand({ themen: [], abschnitte: {}, voll: {}, kennen: 0, ks: 0, sessions: 0, last: null });
  for (const t of [...store.texts.values()]) if (t.typ === "sprechnotizen" && Object.keys(t.notes || {}).length) await store.saveText({ ...t, notes: {} });
  const { db } = await import("./db.js");
  for (const r of await db.getAll("kv")) {
    if (r.key.startsWith("rec:")) await db.kvDel(r.key);
  }
  // Schritt „Heute sprechen“ in der heutigen Tagessession wieder öffnen
  const { lernpfad, sessionSteps, currentDay } = await import("./session.js");
  const days = await lernpfad();
  const cands = [currentDay(days), ...days.filter((d) => d.datum === dayKey())].filter(Boolean);
  for (const d of cands) {
    const key = "session." + d.tag;
    const state = await db.kvGet(key);
    if (!state) continue;
    const idx = sessionSteps(d, { sprech: state.sprech, order: state.order || 1 }).findIndex((s) => s.typ === "sprechtraining");
    if (idx >= 0 && state.done.includes(idx)) { state.done = state.done.filter((i) => i !== idx); await db.kvSet(key, state); }
  }
  const ek = "session.E-" + dayKey();
  const es = await db.kvGet(ek);
  if (es) { const { endspurtDay } = await import("./session.js"); const d = endspurtDay(10); const idx = sessionSteps(d, { sprech: es.sprech, order: es.order || 1 }).findIndex((s) => s.typ === "sprechtraining"); if (idx >= 0) { es.done = es.done.filter((i) => i !== idx); await db.kvSet(ek, es); } }
  return atts.length;
}

// ---------- Einstieg ----------
/** Ein Schritt der Tagessession (oder Knopf auf der Startseite). */
export async function heuteSprechen(el) {
  const data = await load("sprechtraining");
  if (!data || !data.geruest) { toast("Inhalte für das Sprechtraining fehlen."); return { xp: 0, skipped: true }; }
  let st = stand();
  const alle = await themenListe();
  if (!st.themen.length) {
    const r = await waehleThemen(el, alle.filter((t) => data.geruest[t.id]), st);
    if (r.aborted) return r;
    st = stand();
  }
  const plan = planFuerHeute(st, data, alle);
  const go = await intro(el, plan);
  if (!go) return { aborted: true };
  const t0 = Date.now();
  for (const teil of plan.teile) {
    const r = await teil.run(el);
    if (r && r.aborted) return { aborted: true };
  }
  st = stand();
  st.sessions = (st.sessions || 0) + 1;
  st.last = dayKey();
  await saveStand(st);
  const min = Math.max(1, Math.round((Date.now() - t0) / 60000));
  await store.addAttempt({ modul: "sprechen", teil: "training", itemId: "heute-" + dayKey(), score: 1, max: 1, sec: min * 60, xp: 20, meta: { ohneWertung: true, phase: plan.phase } });
  confetti();
  clear(el);
  await new Promise((resolve) => el.append(h("div.result", mascot("cheer", 130, "bounce"), h("h2", "Super gesprochen! 🎤"),
    h("p", `Heute ${min} Minuten Sprechtraining.`), h("div.xp-pill", "+20 XP"),
    h("p.muted", plan.phase === 1 ? "Jeden Tag ein Stück – bis zum 25.11. hast du jede Präsentation einmal ganz gesprochen." : "Wiederholen macht flüssig. Morgen geht's weiter!"),
    h("button.btn.primary.wide", { onclick: resolve }, "Weiter"))));
  return { xp: 20 };
}

function intro(el, plan) {
  return new Promise((resolve) => {
    clear(el);
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve(false) }, "✕"), h("strong", "🎤 Heute sprechen"), h("span")),
      tarsiSays(plan.gruss, "happy"),
      h("div.card", h("strong", `Heute (ca. ${plan.minuten} Min.):`), h("ol", plan.teile.map((t) => h("li", t.titel)))),
      h("p.small.muted", ["", "Phase 1 (bis 25.11.): Präsentation Stück für Stück aufbauen.", "Phase 2 (26.11.–2.12.): ganze Präsentation, 1B in beiden Rollen und Diskussion.", "Phase 3 (ab 3.12.): komplette Durchläufe wie in der Prüfung."][plan.phase]),
      azureHint(),
      h("button.btn.primary.wide", { onclick: () => resolve(true) }, "Los geht's"));
  });
}

function planFuerHeute(st, data, alle) {
  const phase = sprechPhase();
  const meine = st.themen.map((id) => alle.find((t) => t.id === id)).filter(Boolean);
  const teile = [];
  let minuten = 20, gruss = "";
  const ks = (n, teilListe) => ({ titel: `Kernsätze nachsprechen (${n} Sätze)`, run: (el) => kernsaetze(el, data, n, teilListe) });
  if (phase === 1) {
    // aktuelles Thema: erstes, das noch nicht ganz am Stück gesprochen wurde (danach von vorn = 2. Durchgang)
    const runde = Math.min(...meine.map((t) => st.voll[t.id] || 0));
    const thema = meine.find((t) => (st.voll[t.id] || 0) === runde) || meine[0];
    const offen = [0, 1, 2, 3, 4, 5].filter((i) => !(st.abschnitte[`${thema.id}|${i}`]?.n >= 1 + runde));
    teile.push(ks(4, ["1a", "strategie"]));
    if (!st.kennen) teile.push({ titel: "Sich vorstellen (60 Sek.) – für den Prüfungsbeginn", run: (el) => kennenlernen(el, data) });
    if (offen.length) {
      const heute = offen.slice(0, st.kennen ? 3 : 2);
      teile.push({ titel: `„${thema.thema.titel}“: ${heute.map((i) => data.geruest[thema.id].abschnitte[i].titel).join(", ")}`, run: (el) => abschnitte(el, data, thema, heute, runde) });
      gruss = runde ? "Zweiter Durchgang – jetzt geht es um Flüssigkeit. Du kennst die Inhalte schon!" : "Wir bauen deine Präsentation Stück für Stück. Jedes Stück dauert nur 20–40 Sekunden.";
    } else {
      teile.push({ titel: `„${thema.thema.titel}“ ganz am Stück (mit Gerüst, 5 Min. Vorbereitung) + 1B`, run: (el) => voll(el, data, thema, { prep: 5, zuhoeren: false }) });
      minuten = 25;
      gruss = "Alle Abschnitte geübt – heute sprichst du die ganze Präsentation am Stück. Das Gerüst hilft dir!";
    }
  } else if (phase === 2) {
    const thema = meine[(st.sessions || 0) % meine.length];
    teile.push(ks(3, ["1b", "2"]));
    if ((st.sessions || 0) % 2 === 0) {
      teile.push({ titel: `Präsentation „${thema.thema.titel}“ (10 Min. Vorbereitung) + 1B in beiden Rollen`, run: (el) => voll(el, data, thema, { prep: 10, zuhoeren: true }) });
      minuten = 30;
      gruss = "Heute die ganze Präsentation – und in 1B bist du einmal Sprecherin und einmal Zuhörerin.";
    } else {
      teile.push({ titel: "Diskussion (Teil 2, ca. 6 Min.) mit Mini-Schablone", run: (el) => disk(el) });
      minuten = 20;
      gruss = "Heute diskutieren wir! Pro Beitrag: Position → Grund + Beispiel → Rückfrage.";
    }
  } else {
    const thema = meine[(st.sessions || 0) % meine.length];
    if ((st.sessions || 0) % 2 === 0) {
      teile.push({ titel: `Kompletter Durchlauf: 20 Min. Vorbereitung → 1A „${thema.thema.titel}“ → 1B (beide Rollen)`, run: (el) => voll(el, data, thema, { prep: 20, zuhoeren: true, waehlen: true }) });
      teile.push({ titel: "→ Teil 2 Diskussion (6 Min.)", run: (el) => disk(el) });
      minuten = 50;
      gruss = "Generalprobe fürs Sprechen: alles wie in der Prüfung. Plane ca. 50 Minuten ein.";
    } else {
      teile.push(ks(3, ["2", "strategie", "1b"]));
      teile.push({ titel: "Diskussion (Teil 2, ca. 6 Min.)", run: (el) => disk(el) });
      minuten = 20;
      gruss = "Kurzer Tag: Kernsätze und eine Diskussion.";
    }
  }
  return { phase, teile, minuten, gruss };
}

// ---------- Meine Themen ----------
function waehleThemen(el, liste, st) {
  return new Promise((resolve) => {
    clear(el);
    const sel = new Set();
    const count = h("span");
    const goBtn = h("button.btn.primary.wide", { disabled: true, onclick: async () => {
      await saveStand({ ...st, themen: liste.filter((t) => sel.has(t.id)).map((t) => t.id) });
      resolve({});
    } }, "Diese Themen üben");
    const upd = () => { count.textContent = `${sel.size} gewählt`; goBtn.disabled = sel.size < 3 || sel.size > 5; };
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve({ aborted: true }) }, "✕"), h("strong", "Meine Präsentationsthemen"), h("span")),
      tarsiSays("Wähle 3–5 Themen, zu denen dir etwas einfällt – am besten mit persönlichem Bezug. Wir üben sie immer wieder: Beim zweiten und dritten Mal wirst du viel flüssiger!", "happy"),
      h("div.list", liste.map((t) => {
        const b = h("button.option", { onclick: () => { sel.has(t.id) ? sel.delete(t.id) : sel.add(t.id); b.classList.toggle("sel", sel.has(t.id)); upd(); } }, t.thema.titel);
        return b;
      })),
      h("p.small.muted.center", count, " · 3 bis 5 Themen"),
      goBtn);
    upd();
  });
}

// ---------- A: Kernsätze nachsprechen ----------
async function kernsaetze(el, data, n, teile) {
  const st = stand();
  const list = data.kernsaetze.filter((k) => teile.includes(k.teil));
  const start = (st.ks || 0) % list.length;
  const items = Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(start + i) % list.length]);
  for (let i = 0; i < items.length; i++) {
    const r = await kernsatz(el, items[i], i, items.length);
    if (r.aborted) return r;
  }
  const s2 = stand();
  s2.ks = (s2.ks || 0) + items.length;
  await saveStand(s2);
  return {};
}

function kernsatz(el, k, i, n) {
  return new Promise(async (resolve) => {
    clear(el);
    const url = await audioFor(k.id);
    const vorbild = () => (url ? playUrl(url) : speakOnce(k.text, "B"));
    const out = h("div");
    let box;
    box = speakBox({
      reference: k.text, editable: false, tag: "ks", label: "Nachsprechen",
      onDone: async (res) => {
        clear(out);
        const acc = res.accuracy != null ? Math.round(res.accuracy) : null;
        const schwach = res.words.filter((w) => w.acc != null && w.acc < 70 && w.err !== "Omission").slice(0, 3);
        const fehlt = res.words.filter((w) => w.err === "Omission").map((w) => w.w).slice(0, 4);
        if (acc != null) {
          out.append(h("div.card" + (acc >= 85 ? ".ok" : ""),
            h("strong", acc >= 85 ? "🌟 Sehr deutlich!" : acc >= 70 ? "👍 Gut verständlich" : "🙂 Noch einmal langsam üben"),
            h("div.small.muted", `Aussprache-Schätzung: ${acc}/100 (Software, kein telc-Urteil)`),
            schwach.length ? h("div", h("span.small", "Übe diese Wörter: "), schwach.map((w) => h("button.chip", { onclick: () => speakOnce(w.w, "B") }, "🔊 " + w.w))) : null,
            fehlt.length ? h("p.small", "Ausgelassen: " + fehlt.join(", ")) : null));
          await store.addAttempt({ modul: "sprechen", teil: "kernsatz", itemId: k.id, score: acc, max: 100, xp: 3, meta: { ohneWertung: true } });
        }
        out.append(h("button.btn", { onclick: async () => { await vorbild(); await playUrl(res.url); } }, "🔁 Vorbild + ich nacheinander"));
      },
      onFallback: () => {
        clear(out);
        out.append(h("p.small.muted", "Hör dir Vorbild und deine Aufnahme nacheinander an – klingt es ähnlich?"),
          h("button.btn", { onclick: async () => { await vorbild(); if (box.blob) await playUrl(URL.createObjectURL(box.blob)); } }, "🔁 Vorbild + ich nacheinander"));
      },
    });
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => { stopAll(); resolve({ aborted: true }); } }, "✕"), h("strong", `Kernsätze nachsprechen ${i + 1}/${n}`), h("span")),
      h("p.small.muted", "1. Anhören · 2. Nachsprechen – mit derselben Satzmelodie · 3. Vergleichen"),
      h("div.card.kernsatz", h("div.small.muted", k.wozu), h("p.big", k.text), h("button.btn.primary", { onclick: vorbild }, "🔊 Vorbild anhören")),
      box.el, out,
      h("button.btn.wide", { onclick: async () => { await box.settled(); stopAll(); resolve({}); } }, i + 1 < n ? "Nächster Satz →" : "Fertig →"));
    vorbild();
  });
}

// ---------- B + C: Abschnitt für Abschnitt ----------
async function abschnitte(el, data, thema, idxs, runde) {
  for (let j = 0; j < idxs.length; j++) {
    const r = await abschnitt(el, data, thema, idxs[j], { nr: j + 1, von: idxs.length, runde });
    if (r.aborted) return r;
  }
  return {};
}

async function kennenlernen(el, data) {
  const kl = data.kennenlernen;
  const r = await abschnittScreen(el, {
    titel: "Sich vorstellen", untertitel: "Am Anfang der Prüfung stellen Sie sich kurz vor – das nimmt Nervosität.",
    ab: kl.abschnitte[0], recId: "kennen", muster: kl.muster, kontext: "Kurze Vorstellung zu Beginn der mündlichen Prüfung (ca. 60 Sekunden): Name, Beruf/Ausbildung, warum Deutsch/Studium, Interessen.",
  });
  if (!r.aborted) { const st = stand(); st.kennen = (st.kennen || 0) + 1; await saveStand(st); }
  return r;
}

async function abschnitt(el, data, thema, idx, { nr, von, runde }) {
  const g = data.geruest[thema.id];
  const ab = g.abschnitte[idx];
  const lp = ab.typ === "leitpunkt" ? thema.thema.leitpunkte[(ab.nr || 1) - 1] : null;
  const r = await abschnittScreen(el, {
    titel: `${thema.thema.titel}`, untertitel: `Abschnitt ${idx + 1}/6: ${ab.titel}` + (von > 1 ? ` · heute ${nr}/${von}` : ""),
    ab, leitpunkt: lp, recId: `first:${thema.id}:${idx}`, themaId: thema.id, themaTitel: thema.thema.titel, idx,
    kontext: `Präsentation (telc C1 Hochschule, Teil 1A) zum Thema „${thema.thema.titel}“. Aufgabe: ${thema.thema.aufgabe} Leitpunkte: ${thema.thema.leitpunkte.join(" | ")}. Gesprochen wird NUR dieser Abschnitt: ${ab.titel}${lp ? " – Leitpunkt: " + lp : ""}.`,
  });
  if (!r.aborted) {
    const st = stand();
    const k = `${thema.id}|${idx}`;
    const a = st.abschnitte[k] || { n: 0, gut: 0 };
    a.n = Math.max(a.n + 1, runde + 1);
    if (r.urteil === "gut") a.gut++;
    st.abschnitte[k] = a;
    await saveStand(st);
  }
  return r;
}

const AUFGABE_STD = {
  einleitung: 'Sag, worüber du sprichst, und nenne kurz die Reihenfolge deines Vortrags: zuerst …, dann …, zum Schluss …',
  leitpunkt: 'Sprich nur über diesen Punkt des Aufgabenblatts – mit einem Beispiel aus deinem Leben.',
  schluss: 'Fasse deine Meinung in 1–2 Sätzen zusammen und bedanke dich fürs Zuhören.',
  kennenlernen: 'Stell dich vor wie am Anfang der Prüfung: Wer bist du, was machst du beruflich, warum machst du die Prüfung?',
};

const KURZ_SYS = () => `${learnerContext()}
Du bist eine warmherzige, erfahrene Sprechtrainerin für die mündliche Prüfung telc Deutsch C1 Hochschule.
Der Text stammt aus einer automatischen Spracherkennung (oder einem Diktat): Füllwörter wie „äh“ fehlen, Satzzeichen und Groß-/Kleinschreibung sind automatisch, einzelne Wörter können falsch erkannt sein. Bewerte deshalb KEINE Zeichensetzung/Rechtschreibung und sei vorsichtig bei einzelnen seltsamen Wörtern.
Gib genau drei kurze Rückmeldungen (einfaches Deutsch, B2-Erklärsprache, je max. 2 Sätze):
- gut: eine konkrete Stärke (zitiere kurz).
- naechstes: GENAU EINE Sache für den nächsten Versuch. Priorität: 1. Inhalt/Aufgabe dieses Abschnitts erfüllt? 2. Struktur und Verknüpfung (Überleitungen, Konnektoren) 3. Flüssigkeit/Länge 4. höchstens EIN wichtiger Grammatikpunkt.
- besser: EIN verbesserter, natürlich gesprochener Satz (max. 25 Wörter) auf C1-Niveau, den sie wörtlich nachsprechen kann – nah an ihrem Inhalt.
- urteil: „gut“ (Abschnitt erfüllt seinen Zweck, verständlich, ungefähr in der Zielzeit), „teilweise“ oder „noch_nicht“.
Sei ermutigend und ehrlich. Kein Lob ohne Inhalt.`;

const kurzSchema = S.obj({ gut: S.str, naechstes: S.str, besser: S.str, urteil: S.enm("gut", "teilweise", "noch_nicht") });
const vergleichSchema = S.obj({ fortschritt: S.str, gut: S.str, naechstes: S.str, besser: S.str, urteil: S.enm("gut", "teilweise", "noch_nicht") });

function abschnittScreen(el, o) {
  return new Promise(async (resolve) => {
    clear(el);
    const ab = o.ab;
    const ziel = ab.ziel_s || 40;
    const target = [Math.round(ziel * 0.7), Math.round(ziel * 1.5)];
    const out = h("div");
    const versuche = [];
    let urteil = null;
    const first = await getRecording(o.recId);

    const eigene = o.themaId != null ? h("textarea.answer", { rows: 2, placeholder: "Deine Stichworte (max. 5) …", oninput: (e) => saveNote(o.themaId, o.idx, e.target.value) }) : null;
    if (eigene) eigene.value = notes(o.themaId)[o.idx] || "";

    const neuerVersuch = () => {
      const nr = versuche.length + 1;
      const box = speakBox({
        targetSec: target, tag: "abschnitt", label: nr === 1 ? "Sprechen" : "Nochmal sprechen", rows: 3,
        onDone: (res) => feedback(box, res.text, res),
        onFallback: () => {
          if (box._fb) return;
          box._fb = true;
          out.append(h("button.btn.primary.wide", { onclick: () => box.text() ? feedback(box, box.text(), null) : selbst() }, "Weiter zur Rückmeldung"));
        },
      });
      versuche.push({ box });
      return box.el;
    };

    async function feedback(box, text, res) {
      const v = versuche.find((x) => x.box === box);
      v.text = text; v.res = res;
      if (res && !first && versuche.length === 1) keepRecording(o.recId, res.blob, { titel: ab.titel });
      const av = await ai.available();
      if (!av.ok) return selbst(av.msg);
      const wait = thinking(h("p", "Tarsi hört zu …"));
      out.append(wait);
      wait.scrollIntoView({ behavior: "smooth", block: "center" });
      const zeit = (r) => r ? `Gesprochene Zeit: ${Math.round(r.seconds)} s (Ziel ca. ${ziel} s). Zeitwerte: ${fluencyNote(r.stats) || "–"}.` : "(Diktat, keine Zeitwerte)";
      const zweiter = versuche.length > 1 && versuche[versuche.length - 2].text;
      try {
        const msg = zweiter
          ? `${o.kontext}\n\nERSTER VERSUCH:\n"""${versuche[versuche.length - 2].text}"""\n${zeit(versuche[versuche.length - 2].res)}\n\nNEUER VERSUCH:\n"""${text}"""\n${zeit(res)}\n\nBeschreibe in „fortschritt“ in 1–2 Sätzen konkret, was beim neuen Versuch besser ist (ehrlich; wenn nichts besser ist, sag freundlich, woran es liegt). Die anderen Felder beziehen sich auf den NEUEN Versuch.`
          : `${o.kontext}\n\nGESPROCHEN:\n"""${text}"""\n${zeit(res)}`;
        const { data } = await ai.call({ system: KURZ_SYS(), messages: [{ role: "user", content: msg }], schema: zweiter ? vergleichSchema : kurzSchema, maxTokens: 3000, effort: "low" });
        wait.remove();
        urteil = data.urteil === "gut" ? "gut" : urteil || data.urteil;
        await store.addAttempt({ modul: "sprechen", teil: "abschnitt", itemId: o.recId, score: { gut: 2, teilweise: 1, noch_nicht: 0 }[data.urteil] ?? 1, max: 2, sec: Math.round(res?.seconds || 0), xp: 6, meta: { ohneWertung: true, ki: true, versuch: versuche.length } });
        zeigeFeedback(data, res);
      } catch (e) {
        wait.remove();
        selbst(e instanceof AiUnavailable ? e.message : "KI-Rückmeldung gerade nicht möglich.");
      }
    }

    function zeigeFeedback(d, res) {
      const vorher = versuche.length > 1 ? versuche[versuche.length - 2].res : null;
      out.append(h("div.fb3",
        d.fortschritt ? h("div.fb-line.up", h("b", "📈 "), d.fortschritt) : null,
        h("div.fb-line.good", h("b", "✓ "), d.gut),
        h("div.fb-line.next", h("b", "→ "), d.naechstes),
        h("div.fb-line.better", h("b", "✨ "), h("span", d.besser), h("button.btn.small.ghost", { onclick: () => speakOnce(d.besser, "B") }, "🔊 Anhören")),
        vorher && res ? h("div.small.muted", `Vorher: ${fluencyNote(vorher.stats)} · Jetzt: ${fluencyNote(res.stats)}`) : null,
        vorher && res ? h("div.row", h("button.btn.small", { onclick: () => playUrl(vorher.url) }, "▶ Versuch 1"), h("button.btn.small", { onclick: () => playUrl(res.url) }, "▶ Versuch " + versuche.length)) : null,
        first && versuche.length === 1 && res ? h("div.card.soft", h("div.small", `Deine erste Aufnahme dieses Abschnitts (${new Date(first.t).toLocaleDateString("de-DE")}) – hör den Unterschied!`),
          h("div.row", h("button.btn.small", { onclick: () => playUrl(URL.createObjectURL(first.blob)) }, "▶ Damals"), h("button.btn.small", { onclick: () => playUrl(res.url) }, "▶ Heute"))) : null));
      out.append(h("div.row.gap",
        versuche.length < 3 ? h("button.btn.primary", { onclick: (e) => { e.target.parentNode.remove(); const b = neuerVersuch(); out.append(h("p.small.muted", "Sprich den Abschnitt noch einmal – mit dem Tipp und dem ✨-Satz.")), out.append(b); b.scrollIntoView({ behavior: "smooth" }); } }, "🔁 Nochmal – besser!") : null,
        h("button.btn" + (versuche.length >= 3 ? ".primary" : ""), { onclick: async () => { await Promise.all(versuche.map((v) => v.box.settled())); stopAll(); resolve({ urteil }); } }, "Weiter →")));
      out.lastChild.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    function selbst(msg) {
      out.append(h("div.card",
        msg ? h("p.small.muted", msg) : null,
        o.muster ? h("details", h("summary", "📄 Muster"), h("p", o.muster)) : null,
        h("p", "Hör dir deine Aufnahme an. Wie war's?"),
        h("div.row.gap", [["gut", "😊 gut"], ["teilweise", "😐 geht so"], ["noch_nicht", "😕 schwierig"]].map(([k, l]) => h("button.btn", { onclick: async () => {
          await store.addAttempt({ modul: "sprechen", teil: "abschnitt", itemId: o.recId, score: { gut: 2, teilweise: 1, noch_nicht: 0 }[k], max: 2, xp: 5, meta: { ohneWertung: true, selbst: true } });
          const lastBox = versuche[versuche.length - 1]?.box;
          if (lastBox?.blob && !first) keepRecording(o.recId, lastBox.blob, { titel: ab.titel });
          resolve({ urteil: k });
        } }, l)))));
    }

    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => { stopAll(); resolve({ aborted: true }); } }, "✕"), h("div", h("strong", o.titel), h("div.small.muted", o.untertitel)), h("span")),
      o.themaTitel ? h("p.small.muted", `Stell dir vor: Du hältst in der Prüfung einen Vortrag zum Thema „${o.themaTitel}“. Heute übst du nur ein Stück davon.`) : null,
      h("div.task-box.aufgabe", h("div.small.muted", "🎯 Deine Aufgabe"), h("p", h("strong", ab.aufgabe || AUFGABE_STD[ab.typ] || AUFGABE_STD.leitpunkt)),
        h("div.small", `⏱️ ca. ${ziel} Sekunden – das sind etwa ${Math.max(2, Math.round(ziel / 9))} Sätze.`),
        o.leitpunkt ? h("details", h("summary.small", "So steht es im Aufgabenblatt"), h("p.small", o.leitpunkt)) : null),
      h("details.tips", { open: !store.attempts.some((a) => a.modul === "sprechen" && a.teil === "abschnitt") }, h("summary", "❓ So geht's"), h("ol",
        h("li", "Lies die Aufgabe oben."),
        h("li", "Wenn du magst: Ideen und Satzanfänge ansehen (antippen = vorlesen) und eigene Stichworte notieren."),
        h("li", "Roten Knopf drücken und frei sprechen – es muss nicht perfekt sein!"),
        h("li", "„Fertig“ drücken – Tarsi gibt dir drei kurze Rückmeldungen."),
        h("li", "Mit „🔁 Nochmal – besser!“ probierst du den Tipp gleich aus."))),
      h("div.card",
        ab.stichworte?.length ? h("div", h("span.small", "Ideen (Beispiele): "), ab.stichworte.map((s) => h("span.chip.soft", s))) : null,
        eigene,
        h("div.small", "Satzanfänge (antippen = vorlesen):"),
        h("div.chips", (ab.satzanfaenge || []).map((s) => h("button.chip", { onclick: () => speakOnce(s.replace(/\s*…\s*$/, ""), "B") }, s)))),
      neuerVersuch(), out);
  });
}

// ---------- D / F: ganze Präsentation ----------
async function voll(el, data, thema, { prep, zuhoeren, waehlen }) {
  const anderes = Object.keys(data.geruest).filter((id) => id !== thema.id);
  const hoerThema = anderes[(stand().sessions || 0) % anderes.length];
  const r = await praesentation(el, thema.blatt, {
    prepMinutes: prep, training: true, themaIndex: waehlen ? undefined : thema.idx, geruest: data.geruest, zuhoeren: zuhoeren ? hoerThema : null,
  });
  if (r && !r.aborted) {
    const st = stand();
    const id = r.themaId || thema.id;
    st.voll[id] = (st.voll[id] || 0) + 1;
    await saveStand(st);
  }
  return r;
}

async function disk(el) {
  const sp = await load("sprechen");
  const list = pool(sp.diskussion);
  const last = (id) => store.attempts.filter((a) => a.modul === "sprechen" && a.itemId === id).reduce((m, a) => Math.max(m, a.t), 0);
  const d = [...list].sort((a, b) => last(a.id) - last(b.id))[0];
  return diskussion(el, d, { minuten: 6, training: true });
}
