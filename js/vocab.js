// Akademischer Wortschatz und Redewendungen mit Spaced Repetition.
// Übungsformen Wörter: Bedeutung erkennen, Wort zur Erklärung finden, Lückentext, Synonym/Antonym, Wortfamilie, Satz bilden (KI).
// Übungsformen Redewendungen: Bedeutung, Lückentext, passende Situation, eigener Satz (KI).
import { h, clear, md, sample, shuffle, toast } from "./ui.js";
import { emptyBox } from "./mascot.js";
import { load, pool, THEMEN } from "./content.js";
import { pickCards, review } from "./srs.js";
import { store } from "./store.js";
import { runQuiz, resultScreen } from "./quiz.js";
import { ai, S, AiUnavailable } from "./ai.js";

const PRUEF_LABEL = { schreiben: "✍️ eher schriftlich", sprechen: "🎤 eher mündlich", beides: "✍️🎤 schriftlich & mündlich", vermeiden: "⚠️ zu umgangssprachlich für die Prüfung" };

function distractors(all, self, field, n = 3, filter = () => true) {
  const seen = new Set([String(self[field] ?? "").toLowerCase()]);
  const out = [];
  for (const x of shuffle(all)) {
    if (x.id === self.id || !filter(x)) continue;
    const v = x[field];
    if (!v || seen.has(String(v).toLowerCase())) continue;
    seen.add(String(v).toLowerCase());
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

function wordCard(w) {
  return h("div.lernkarte",
    h("div.lk-wort", w.wort),
    w.formen ? h("div.muted.small", w.formen) : null,
    h("div.chip", THEMEN[w.thema] || w.thema),
    h("p", { html: md(w.erklaerung) }),
    w.synonyme?.length ? h("p.small", h("strong", "≈ "), w.synonyme.join(", ")) : null,
    w.antonyme?.length ? h("p.small", h("strong", "↔ "), w.antonyme.join(", ")) : null,
    w.kollokationen?.length ? h("p.small", h("strong", "Typisch: "), w.kollokationen.join(" · ")) : null,
    h("p.beispiel", "„" + w.beispiel + "“"));
}

function idiomCard(r) {
  return h("div.lernkarte",
    h("div.lk-wort", r.ausdruck),
    h("div.row.wrap", h("span.chip", { redemittel: "Redemittel", idiom: "Idiom", feste_wendung: "Feste Wendung" }[r.typ] || r.typ), r.pruefung ? h("span.chip.soft", PRUEF_LABEL[r.pruefung] || r.pruefung) : null),
    h("p", { html: md(r.bedeutung) }),
    h("p.beispiel", "„" + r.beispiel + "“"),
    r.hinweis ? h("p.small.muted", "💡 " + r.hinweis) : null);
}

/** Wortstamm eines Eintrags („die Methodik“ → „method“), um ihn in Erklärungen/Sätzen zu verdecken. */
function stemOf(wort) {
  const w = String(wort).replace(/^(der|die|das|sich)\s+/i, "").split(/[\s,(+]/)[0].toLowerCase();
  if (w.length <= 4) return w;
  return w.slice(0, Math.max(4, Math.min(w.length - 2, 7)));
}
/** Verdeckt Wörter, die mit dem Stamm beginnen oder ihn enthalten (z. B. „Methoden“ bei „Methodik“). */
export function mask(text, ...stems) {
  let t = String(text);
  for (const s of stems.filter((x) => x && x.length >= 3)) {
    const re = new RegExp(`[A-Za-zÄÖÜäöüß-]*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\/** Erzeugt eine Übungsaufgabe für ein Wort, abhängig vom Lernstand. */")}[A-Za-zÄÖÜäöüß-]*`, "gi");
    t = t.replace(re, "…");
  }
  return t;
}
const explOf = (w) => mask(w.erklaerung, stemOf(w.wort));
const bedOf = (r) => mask(r.bedeutung, r.luecke?.loesung ? stemOf(r.luecke.loesung) : "");

/** Erzeugt eine Übungsaufgabe für ein Wort, abhängig vom Lernstand. */
function wordExercise(w, all, isNew) {
  const c = store.card(w.id);
  const reps = c ? c.reps : 0;
  const types = [];
  // Neue Wörter: Die Lernkarte kommt vorher auf einem eigenen Bildschirm, die Aufgabe ein paar Karten später.
  if (isNew || reps === 0) types.push("bedeutung", w.luecke ? "luecke" : "bedeutung");
  else {
    types.push("luecke", "rueckwaerts");
    if (w.synonyme?.length) types.push("synonym");
    if (w.antonyme?.length) types.push("antonym");
    if (w.wortfamilie?.length) types.push("familie");
    if (reps >= 2) types.push("luecke");
  }
  const t = types[Math.floor(Math.random() * types.length)];
  const sameKind = (x) => x.wortart === w.wortart;
  let it;
  if (t === "bedeutung") {
    const others = shuffle(all.filter((x) => x.id !== w.id && sameKind(x))).slice(0, 3).map(explOf);
    const opts = [explOf(w), ...others];
    it = { label: "Bedeutung", prompt: `Was bedeutet **${w.wort}**?`, options: opts, correct: 0, speak: w.wort };
  } else if (t === "rueckwaerts") {
    const opts = [w.wort, ...distractors(all, w, "wort", 3, sameKind)];
    it = { label: "Welches Wort?", prompt: `Welches Wort passt zu dieser Erklärung?\n\n_${explOf(w)}_`, options: opts, correct: 0 };
  } else if (t === "luecke" && w.luecke) {
    const o = w.luecke.optionen;
    // Andere Vorkommen des Wortes im Satz verdecken (die Lücke selbst bleibt)
    const satz = w.luecke.satz.split("___").map((p) => mask(p, stemOf(w.luecke.loesung), stemOf(w.wort))).join("_____");
    it = { label: "Lückentext", prompt: satz, options: o, correct: o.indexOf(w.luecke.loesung) };
  } else if (t === "synonym" || t === "antonym") {
    const field = t === "synonym" ? "synonyme" : "antonyme";
    const right = w[field][0];
    const pool = shuffle(all.filter((x) => x.id !== w.id && x[field]?.length)).map((x) => x[field][0]).filter((v) => v !== right && !w.synonyme?.includes(v) && !w.antonyme?.includes(v));
    const opts = [right, ...[...new Set(pool)].slice(0, 3)];
    it = { label: t === "synonym" ? "Synonym" : "Gegenteil", prompt: t === "synonym" ? `Welches Wort bedeutet ungefähr dasselbe wie **${w.wort}**?` : `Was ist das Gegenteil von **${w.wort}**?`, options: opts, correct: 0 };
  } else if (t === "familie") {
    const right = w.wortfamilie[0];
    const pool = shuffle(all.filter((x) => x.id !== w.id && x.wortfamilie?.length)).map((x) => x.wortfamilie[0]).filter((v) => !w.wortfamilie.includes(v));
    const opts = [right, ...[...new Set(pool)].slice(0, 3)];
    it = { label: "Wortfamilie", prompt: `Welches Wort gehört zur selben Wortfamilie wie **${w.wort}**?`, options: opts, correct: 0 };
  }
  if (!it || it.correct < 0 || it.options.length < 2) {
    const opts = [explOf(w), ...shuffle(all.filter((x) => x.id !== w.id)).slice(0, 3).map(explOf)];
    it = { label: "Bedeutung", prompt: `Was bedeutet **${w.wort}**?`, options: opts, correct: 0 };
  }
  it.explain = `**${w.wort}** – ${w.erklaerung}\n„${w.beispiel}“`;
  return it;
}

function idiomExercise(r, all, isNew) {
  const c = store.card(r.id);
  const reps = c ? c.reps : 0;
  const types = isNew || reps === 0 ? ["bedeutung", "situation"] : ["luecke", "situation", "bedeutung", "luecke"];
  const t = types[Math.floor(Math.random() * types.length)];
  let it;
  if (t === "luecke" && r.luecke) {
    const satz = r.luecke.satz.split("___").map((p) => mask(p, stemOf(r.luecke.loesung))).join("_____");
    it = { label: "Lückentext", prompt: satz, options: r.luecke.optionen, correct: r.luecke.optionen.indexOf(r.luecke.loesung) };
  } else if (t === "situation" && r.situation) {
    it = { label: "Passende Situation", prompt: `**${r.ausdruck}**\n\n${r.situation.frage}`, options: r.situation.optionen, correct: r.situation.loesung };
  } else {
    const opts = [bedOf(r), ...shuffle(all.filter((x) => x.id !== r.id && x.typ === r.typ)).slice(0, 3).map(bedOf)];
    it = { label: "Bedeutung", prompt: `Was bedeutet **${r.ausdruck}**?`, options: opts, correct: 0 };
  }
  if (it.correct < 0) it = { label: "Bedeutung", prompt: `Was bedeutet **${r.ausdruck}**?`, options: [bedOf(r), ...shuffle(all.filter((x) => x.id !== r.id)).slice(0, 3).map(bedOf)], correct: 0 };
  it.explain = `**${r.ausdruck}** – ${r.bedeutung}\n„${r.beispiel}“` + (r.pruefung ? `\n${PRUEF_LABEL[r.pruefung] || ""}` : "");
  return it;
}

/**
 * Eine SRS-Runde.
 * @param {"wort"|"rw"} kind
 * @param {{n?:number, filter?:Function, title?:string, embedded?:boolean}} opts
 */
export async function srsRound(el, kind, opts = {}) {
  const all = kind === "wort" ? await load("wortschatz") : await load("redewendungen");
  if (!all.length) {
    clear(el).append(emptyBox("Die Inhalte werden noch erstellt. Bitte später erneut versuchen."));
    return { score: 0, max: 0, xp: 0, aborted: true };
  }
  const source = opts.filter ? all.filter(opts.filter) : all;
  const s = store.settings;
  const picked = pickCards(source, kind, opts.n || 10, kind === "wort" ? s.newWordsPerDay : s.newIdiomsPerDay);
  if (!picked.length) {
    clear(el).append(emptyBox("Für heute ist alles wiederholt. 🎉 Neue Karten gibt es morgen wieder (oder Tageslimit in den Einstellungen erhöhen).", "cheer"));
    return { score: 0, max: 0, xp: 0, aborted: true, empty: true };
  }
  const items = [];
  const waiting = [];
  const release = () => {
    for (const w of waiting) w.gap--;
    while (waiting.length && waiting[0].gap <= 0) items.push(waiting.shift().ex);
  };
  for (const x of picked) {
    const c = store.card(x.id);
    const isNew = !c || !c.seen;
    const ex = kind === "wort" ? wordExercise(x, all, isNew) : idiomExercise(x, all, isNew);
    if (isNew) ex.label = "Neues Wort – weißt du es noch?";
    ex.onResult = async (ok, given) => {
      await review(x.id, kind, ok ? (isNew ? 3 : 4) : 0);
      if (!ok) {
        await store.addError({
          modul: kind === "wort" ? "wortschatz" : "redewendungen",
          kategorie: kind === "wort" ? "wortschatz" : "redewendung",
          itemRef: x.id,
          frage: ex.prompt,
          optionen: ex.options,
          loesung: ex.correct,
          richtig: ex.options?.[ex.correct],
          gegeben: given,
          erklaerung: ex.explain,
        });
      }
    };
    if (isNew) {
      items.push({ type: "intro", label: kind === "wort" ? "Neues Wort" : "Neue Redewendung", prompt: kind === "wort" ? wordCard(x) : idiomCard(x), speak: kind === "wort" ? x.wort : x.ausdruck });
      waiting.push({ ex, gap: 2 });
    } else items.push(ex);
    release();
  }
  items.push(...waiting.map((w) => w.ex));
  const res = await runQuiz(el, { title: opts.title || (kind === "wort" ? "Wortschatz" : "Redewendungen"), items });
  const xp = res.aborted ? res.score : res.score + 5;
  await store.addAttempt({ modul: kind === "wort" ? "wortschatz" : "redewendungen", score: res.score, max: res.max, sec: res.sec, xp, meta: { ohneWertung: true } });
  if (!opts.embedded && !res.aborted) await resultScreen(el, { score: res.score, max: res.max, xp });
  return { ...res, xp };
}

/** Eigenen Satz bilden – KI prüft, sonst Musterbeispiel + Selbstcheck. */
export async function satzWerkstatt(el, kind, item) {
  return new Promise((resolve) => {
    clear(el);
    const target = kind === "wort" ? item.wort : item.ausdruck;
    const ta = h("textarea.answer", { rows: 3, placeholder: "Dein Satz … (Tipp: Diktierfunktion 🎤 der Tastatur)" });
    const out = h("div");
    const btn = h("button.btn.primary.wide", { onclick: async () => {
      const satz = ta.value.trim();
      if (satz.split(/\s+/).length < 4) return toast("Bitte einen ganzen Satz schreiben.");
      btn.disabled = true;
      btn.textContent = "Wird geprüft …";
      try {
        const { data } = await ai.call({
          system: "Du bist eine freundliche, genaue Deutschlehrerin (Prüfungsvorbereitung telc C1 Hochschule). Antworte nur auf Deutsch, einfach und klar (B2-Erklärsprache).",
          messages: [{ role: "user", content: `Die Lernerin soll einen eigenen Satz mit „${target}“ bilden (Bedeutung: ${item.erklaerung || item.bedeutung}).\nIhr Satz: „${satz}“\nPrüfe: Wird der Ausdruck korrekt und in passender Bedeutung verwendet? Ist der Satz grammatisch korrekt? Gib eine kurze Rückmeldung (max. 3 Sätze) und eine verbesserte Version (oder denselben Satz, wenn er korrekt ist).` }],
          schema: S.obj({ ausdruck_korrekt: S.bool, grammatik_korrekt: S.bool, rueckmeldung: S.str, verbesserung: S.str }),
          maxTokens: 4000,
          effort: "low",
        });
        const ok = data.ausdruck_korrekt && data.grammatik_korrekt;
        clear(out).append(h("div.feedback" + (ok ? ".ok" : ".no"), h("div.fb-title", ok ? "✓ Sehr gut verwendet!" : "Fast – schau mal:"), h("div.fb-exp", data.rueckmeldung), !ok ? h("div.fb-sol", h("span.muted", "Besser: "), h("strong", data.verbesserung)) : null));
        if (!ok) await store.addError({ modul: kind === "wort" ? "wortschatz" : "redewendungen", kategorie: kind === "wort" ? "wortschatz" : "redewendung", itemRef: item.id + ":satz", frage: `Eigener Satz mit **${target}**`, richtig: data.verbesserung, gegeben: satz, erklaerung: data.rueckmeldung });
        await review(item.id, kind, ok ? 4 : 0);
        finish(ok);
      } catch (e) {
        const msg = e instanceof AiUnavailable ? e.message : "Prüfung nicht möglich.";
        clear(out).append(h("p.muted.small", msg), h("div.feedback", h("div.fb-title", "Vergleiche mit dem Beispiel:"), h("div.fb-exp", "„" + item.beispiel + "“")),
          h("div.row", h("button.btn.bad", { onclick: () => finish(false) }, "Meiner war falsch"), h("button.btn.good", { onclick: () => finish(true) }, "Meiner passt")));
      }
    } }, "Satz prüfen");
    const finish = async (ok) => {
      await store.addAttempt({ modul: kind === "wort" ? "wortschatz" : "redewendungen", score: ok ? 1 : 0, max: 1, xp: 3, meta: { satz: true, ohneWertung: true } });
      btn.remove();
      out.querySelectorAll(".row").forEach((r) => r.remove());
      out.append(h("button.btn.primary.wide", { onclick: () => resolve(ok) }, "Weiter"));
    };
    el.append(h("div.quiz-card", h("div.chip", "Eigener Satz"), h("h3", target), h("p.muted", item.erklaerung || item.bedeutung), ta), btn, out);
  });
}

/** Zuordnen: 5 Ausdrücke ↔ 5 Bedeutungen antippen (Redewendungen oder Wörter). */
export async function matchRound(el, kind, opts = {}) {
  const all = kind === "wort" ? await load("wortschatz") : await load("redewendungen");
  const src = opts.filter ? all.filter(opts.filter) : all;
  const seen = src.filter((x) => store.card(x.id)?.seen);
  const pick = sample(seen.length >= 5 ? seen : src, 5);
  const left = shuffle(pick), right = shuffle(pick);
  const label = (x) => (kind === "wort" ? x.wort : x.ausdruck);
  const meaning = (x) => (kind === "wort" ? explOf(x) : bedOf(x));
  const started = Date.now();
  return new Promise((resolve) => {
    clear(el);
    let selL = null, selR = null, done = 0, wrong = 0;
    const colL = h("div.match-col"), colR = h("div.match-col");
    const status = h("p.muted.small", "Tippe links einen Ausdruck und rechts die passende Bedeutung an.");
    const tryPair = async () => {
      if (!selL || !selR) return;
      const a = selL, b = selR;
      selL = selR = null;
      if (a.dataset.id === b.dataset.id) {
        a.className = b.className = "option right";
        a.disabled = b.disabled = true;
        done++;
        await review(a.dataset.id, kind, 3);
        if (done === pick.length) finish();
      } else {
        wrong++;
        a.className = b.className = "option wrong";
        const x = pick.find((p) => p.id === a.dataset.id);
        await store.addError({ modul: kind === "wort" ? "wortschatz" : "redewendungen", kategorie: kind === "wort" ? "wortschatz" : "redewendung", itemRef: x.id, frage: `Was bedeutet **${label(x)}**?`, optionen: [meaning(x), ...pick.filter((p) => p.id !== x.id).slice(0, 3).map(meaning)], loesung: 0, richtig: meaning(x), gegeben: b.textContent, erklaerung: `„${x.beispiel}“` });
        setTimeout(() => { if (!a.disabled) a.className = "option"; if (!b.disabled) b.className = "option"; }, 600);
      }
    };
    for (const x of left) colL.append(h("button.option", { "data-id": x.id, onclick: (e) => { if (selL) selL.classList.remove("sel"); selL = e.currentTarget; selL.classList.add("sel"); tryPair(); } }, label(x)));
    for (const x of right) colR.append(h("button.option.small", { "data-id": x.id, onclick: (e) => { if (selR) selR.classList.remove("sel"); selR = e.currentTarget; selR.classList.add("sel"); tryPair(); } }, meaning(x)));
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve({ aborted: true }) }, "✕"), h("strong", "Zuordnen"), h("span")), status, h("div.match", colL, colR));
    async function finish() {
      const score = Math.max(0, pick.length - wrong);
      const xp = 5 + score;
      await store.addAttempt({ modul: kind === "wort" ? "wortschatz" : "redewendungen", score, max: pick.length, sec: Math.round((Date.now() - started) / 1000), xp, meta: { zuordnen: true, ohneWertung: true } });
      await resultScreen(el, { title: "Alles zugeordnet!", score, max: pick.length, xp });
      resolve({ score, max: pick.length, xp });
    }
  });
}

/** Wortliste zum Nachschlagen (nach Thema, mit Suche). */
export async function browseList(el, kind) {
  const all = kind === "wort" ? await load("wortschatz") : await load("redewendungen");
  clear(el);
  const q = h("input.search", { type: "search", placeholder: "Suchen …" });
  const list = h("div.list");
  const render = () => {
    clear(list);
    const term = q.value.trim().toLowerCase();
    const items = all.filter((x) => !term || JSON.stringify(x).toLowerCase().includes(term)).slice(0, 150);
    for (const x of items) {
      const c = store.card(x.id);
      const state = !c?.seen ? "neu" : c.reps >= 2 ? "gelernt" : "im Training";
      list.append(h("details.entry",
        h("summary", h("span", kind === "wort" ? x.wort : x.ausdruck), h("span.chip.soft", state)),
        kind === "wort" ? wordCard(x) : idiomCard(x)));
    }
    if (!items.length) list.append(h("p.muted", "Nichts gefunden."));
  };
  q.addEventListener("input", render);
  el.append(q, list);
  render();
}

export { wordCard, idiomCard };
