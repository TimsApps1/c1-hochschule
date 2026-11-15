// „Aufgaben verstehen“ (Version 2, nach zwei unabhängigen Gutachten):
//   1. Strategie zuerst: „So liest du eine Aufgabe“ mit 5 festen Fragen (TUN, REIN, WIE VIEL, ACHTUNG, FÜR WEN/WO).
//   2. Verstehen: Aufgabe normal lesen → „Was musst du hier tun?“ (Multiple Choice).
//   3. Begründen: „Welches Wort hat dir das gezeigt?“ – pro Bildschirm EINE Kategorie suchen, ein Kernwort genügt.
//   4. Optional eine echte Falle. Danach „Einfach gesagt“ und Schritte.
// Inhalte: data/aufgaben.json (teile, aufgaben, glossar) und data/aufgaben_spezifisch.json (je Schreib-/Sprechaufgabe der App).
import { h, clear, md, shuffle, sample, toast, modal } from "./ui.js";
import { load } from "./content.js";
import { store } from "./store.js";
import { runQuiz, resultScreen } from "./quiz.js";
import { ai, S, AiUnavailable } from "./ai.js";
import { emptyBox, mascot, thinking, tarsiSays } from "./mascot.js";

export const TEIL_NAMEN = {
  lv1: "Lesen 1", lv2: "Lesen 2", lv3: "Lesen 3", sb: "Sprachbausteine", hv1: "Hören 1", hv2: "Hören 2", hv3: "Hören 3",
  sa: "Schreiben", mp1a: "Präsentation", mp1b: "Anschlussfragen", mp2: "Diskussion",
};

export const KAT = {
  tun: { icon: "🎯", name: "TUN", frage: "Was soll ich TUN?", find: "Tippe auf das Wort, das dir sagt, was du **TUN** sollst." },
  inhalt: { icon: "📌", name: "REIN", frage: "Was muss unbedingt REIN?", find: "Tippe auf das, was unbedingt in deine Antwort **hinein muss**." },
  menge: { icon: "🔢", name: "WIE VIEL", frage: "Wie viel? Wie lange?", find: "Tippe auf die Angabe: **wie viel** oder **wie lange**?" },
  achtung: { icon: "⚠️", name: "ACHTUNG", frage: "Kleine Wörter, große Wirkung", find: "Tippe auf das **kleine Wort**, das die Aufgabe einschränkt oder genauer macht." },
  rahmen: { icon: "👤", name: "FÜR WEN / WO", frage: "Für wen? Wo? In welcher Form?", find: "Tippe auf das, was sagt: **für wen**, **wo** oder **in welcher Form**?" },
};

async function data() {
  const a = await load("aufgaben");
  const sp = await load("aufgaben_spezifisch");
  const base = a && !Array.isArray(a) ? a : { teile: [], aufgaben: [], glossar: [] };
  return { teile: base.teile || [], glossar: base.glossar || [], items: [...(base.aufgaben || []), ...(Array.isArray(sp) ? sp : [])] };
}

function seenCount(id) {
  return store.attempts.filter((a) => a.modul === "aufgaben" && a.itemId === id).length;
}

const VERSTEHEN = ["lv1", "lv2", "lv3", "sb", "hv1", "hv2", "hv3"];
function findPrompt(kat, teil) {
  if (kat === "inhalt" && VERSTEHEN.includes(teil)) return "Tippe auf das, **wonach du suchen** oder **worauf du achten** musst.";
  return KAT[kat].find;
}

// ---------- Text in antippbare Wörter zerlegen, Markierungen zuordnen ----------
const clean = (w) => String(w).toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Liefert Zeilen mit Tokens {t, k} – k = Index der Markierung (erstes Vorkommen) oder -1. */
function tokenize(text, marks = []) {
  const lines = String(text).split("\n").map((line) => line.split(/(\s+)/).filter((x) => x.length).map((t) => ({ t, ws: !t.trim(), k: -1 })));
  const flat = lines.flat().filter((x) => !x.ws);
  marks.forEach((m, mi) => {
    const parts = String(m.text).split(/\s+/).map(clean).filter(Boolean);
    if (!parts.length) return;
    for (let i = 0; i + parts.length <= flat.length; i++) {
      if (parts.every((p, j) => clean(flat[i + j].t) === p) && parts.every((_, j) => flat[i + j].k === -1)) {
        for (let j = 0; j < parts.length; j++) flat[i + j].k = mi;
        return; // nur erstes Vorkommen
      }
    }
  });
  return lines;
}

/** Markiert Arbeitsverben im Imperativ („Verfassen Sie“, „Kreuzen Sie … an“) als TUN-Wörter (Index -2). */
function markImperatives(lines) {
  const flat = lines.flat().filter((x) => !x.ws);
  for (let i = 0; i + 1 < flat.length; i++) {
    const w = flat[i].t.replace(/[^\p{L}]/gu, "");
    if (flat[i].k === -1 && /^\p{Lu}\p{Ll}+$/u.test(w) && clean(flat[i + 1].t) === "sie" && !/^(Sie|Die|Der|Das|Wenn|Ob|Wie|Was|Welche|Bitte|Haben|Sind|Können|Dabei|Danach|Dann|Lesen)$/.test(w)) flat[i].k = -2;
  }
  return lines;
}

/** Fließtext; markierte Stellen optional farbig (für Beispiel/Auflösung). */
function renderText(text, marks, { show = false, onTap } = {}) {
  const box = h("div.atext");
  for (const line of markImperatives(tokenize(text, marks))) {
    const p = h("p");
    for (const tok of line) {
      if (tok.ws) { p.append(document.createTextNode(" ")); continue; }
      const cls = show && tok.k >= 0 ? `.mk.k-${marks[tok.k].kat}` : "";
      const el = h((onTap ? "button.tw" : "span.tw") + cls, { "data-k": tok.k }, tok.t);
      if (onTap) el.addEventListener("click", () => onTap(tok.k, el, box));
      p.append(el);
    }
    box.append(p);
  }
  return box;
}

function legend(kats) {
  return h("div.legend", kats.map((k) => h("span.leg.k-" + k, KAT[k].icon + " " + KAT[k].name)));
}

function zitateBox(it) {
  if (!it.zitate?.length) return null;
  return h("details.zitate", h("summary", "Die zwei Aussagen (Zitate) anzeigen"), it.zitate.map((z) => h("blockquote", "„" + String(z.text).replace(/^„|“$/g, "") + "“", h("cite", z.person))));
}

function helpText(it) {
  const parts = [`**Einfach gesagt:** ${it.einfach}`];
  if (it.schritte?.length) parts.push("**So gehst du vor:**\n" + it.schritte.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  return parts.join("\n\n");
}

// ---------- Strategie-Karte ----------
const BEISPIEL = {
  text: "Erörtern Sie in einem Beitrag für die Hochschulzeitung, ob Prüfungen nur noch digital stattfinden sollten. Gehen Sie auf beide Aussagen ein. Schreiben Sie mindestens 350 Wörter.",
  marks: [
    { text: "Erörtern", kat: "tun", warum: "Pro und Contra abwägen und deine Meinung begründen." },
    { text: "Beitrag für die Hochschulzeitung", kat: "rahmen", warum: "Für Leser einer Zeitung: sachlich, aber gut lesbar." },
    { text: "nur", kat: "achtung", warum: "Es geht um NUR digital – nicht um „auch digital“." },
    { text: "beide Aussagen", kat: "inhalt", warum: "Beide Zitate müssen vorkommen." },
    { text: "mindestens 350 Wörter", kat: "menge", warum: "Weniger kostet Punkte." },
  ],
};

export function strategyCard(compact = false) {
  return h("div.strategy-card",
    tarsiSays(compact ? "Denk an die 5 Fragen – dann übersiehst du nichts!" : "So liest du jede Aufgabe: Stell dir immer diese 5 Fragen. Die Antworten stehen fast immer in wenigen Wörtern.", "think", 64),
    h("ol.five", Object.entries(KAT).map(([k, v]) => h("li.k-" + k, h("strong", v.icon + " " + v.frage)))),
    compact ? null : h("div", h("p.small.muted", "Beispiel – die 5 Antworten sind farbig markiert:"), renderText(BEISPIEL.text, BEISPIEL.marks, { show: true }),
      h("ul.small", BEISPIEL.marks.map((m) => h("li", h("span.leg.k-" + m.kat, KAT[m.kat].icon + " " + m.text), " – " + m.warum)))));
}

// ---------- „Finde das Wort“-Bildschirm ----------
// Richtig ist JEDE Markierung derselben Kategorie (und beim TUN-Schritt jedes Arbeitsverb im Imperativ).
// Eine Markierung einer anderen Kategorie ist kein Fehler, sondern bekommt einen Hinweis.
function findItem(it, kat, label, extraExplain = "") {
  const ms = it.markierungen;
  const same = ms.map((m, i) => (m.kat === kat ? i : -1)).filter((i) => i >= 0);
  const mainM = ms[same[0]];
  return {
    type: "custom", label,
    solution: same.map((i) => ms[i].text).join(" · "),
    explain: same.map((i) => (ms[i].warum ? `**${ms[i].text}:** ${ms[i].warum}` : "")).filter(Boolean).join("\n") + (extraExplain ? "\n\n" + extraExplain : ""),
    prompt: h("div.prompt", { html: md(KAT[kat].icon + " " + findPrompt(kat, it.teil)) }),
    render: ({ card, settle }) => {
      let tries = 0, done = false;
      const hint = h("p.find-hint");
      const reveal = (root) => same.forEach((i) => root.querySelectorAll(`[data-k="${i}"]`).forEach((x) => x.classList.add("mk", "k-" + kat, "hit")));
      const box = renderText(it.anweisung, ms, {
        onTap: (k, el, root) => {
          if (done) return;
          const ok = (k >= 0 && ms[k].kat === kat) || (k === -2 && kat === "tun");
          if (ok) {
            done = true;
            if (k === -2) el.classList.add("mk", "k-tun", "hit");
            reveal(root);
            clear(hint);
            return settle(tries === 0, el.textContent);
          }
          if (k === -2) {
            el.classList.add("mk", "k-tun", "soft");
            clear(hint).append(`„${el.textContent}“ ist ein Arbeitsauftrag (🎯 TUN). Gesucht ist jetzt ${KAT[kat].icon} ${KAT[kat].name}.`);
            return;
          }
          if (k >= 0) {
            const other = ms[k];
            root.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.classList.add("mk", "k-" + other.kat, "soft"));
            clear(hint).append(`Gut gesehen – „${other.text}“ ist auch wichtig, gehört aber zu ${KAT[other.kat].icon} ${KAT[other.kat].name}. Gesucht ist ${KAT[kat].icon} ${KAT[kat].name}.`);
            return;
          }
          tries++;
          el.classList.add("nope");
          setTimeout(() => el.classList.remove("nope"), 600);
          if (tries === 1) {
            // Tipp: Satz mit dem gesuchten Wort hervorheben
            const target = root.querySelector(`[data-k="${same[0]}"]`);
            target?.closest("p")?.classList.add("focus");
            clear(hint).append("Nicht ganz. Tipp: Das Wort steht in der hervorgehobenen Zeile.");
          } else {
            done = true;
            reveal(root);
            clear(hint);
            settle(false, el.textContent);
          }
        },
      });
      card.append(zitateBox(it), box, hint);
    },
    onResult: async (ok, given) => {
      if (!ok) await store.addError({ modul: "aufgaben", kategorie: "aufgabe", itemRef: `${it.id}#${kat}`, frage: `${KAT[kat].frage}\n\n_${it.anweisung}_`, richtig: mainM.text, gegeben: given, erklaerung: mainM.warum || "", typ: "self" });
    },
  };
}

function mcItem(it, q, label, withHelp) {
  return {
    label,
    prompt: h("div", h("div.atext.plain", it.anweisung.split("\n").map((l) => h("p", l))), zitateBox(it), h("div.prompt", { html: md(q.text || "Was musst du hier tun?") })),
    options: q.optionen, correct: q.loesung,
    explain: (q.erklaerung || "") + (withHelp ? "\n\n" + helpText(it) : ""),
    onResult: async (ok, given) => {
      if (!ok) await store.addError({ modul: "aufgaben", kategorie: "aufgabe", itemRef: it.id + "#" + (q.text || "frage"), frage: `${q.text}\n\n_${it.anweisung}_`, optionen: q.optionen, loesung: q.loesung, richtig: q.optionen[q.loesung], gegeben: given, erklaerung: q.erklaerung || "" });
    },
  };
}

/** Runde: Strategie → je Aufgabe: verstehen (MC) → 2× begründen (Wort finden) → max. 1 Falle pro Runde. */
export async function aufgabenRound(el, { n = 3, teil, embedded } = {}) {
  const d = await data();
  let pool = d.items.filter((x) => (!teil || x.teil === teil) && x.frage?.optionen?.length);
  if (!pool.length) {
    clear(el).append(emptyBox("Die Übungen zu Aufgabenstellungen werden gerade erstellt."));
    return { aborted: true, empty: true };
  }
  const order = (arr) => shuffle(arr).sort((a, b) => seenCount(a.id) - seenCount(b.id));
  if (!teil) {
    const ver = order(pool.filter((x) => VERSTEHEN.includes(x.teil)));
    const pro = order(pool.filter((x) => !VERSTEHEN.includes(x.teil)));
    const mix = [];
    for (let i = 0; mix.length < n && (ver.length || pro.length); i++) mix.push(i % 3 === 2 ? pro.shift() || ver.shift() : ver.shift() || pro.shift());
    pool = mix.filter(Boolean);
  } else pool = order(pool).slice(0, n);
  const rounds = store.attempts.filter((a) => a.modul === "aufgaben" && a.itemId === "runde").length;
  const items = [{ type: "intro", label: "So liest du eine Aufgabe", prompt: strategyCard(rounds >= 1), button: "Los geht's" }];
  const t = teil && d.teile.find((x) => x.teil === teil);
  if (t) {
    items.push({ type: "intro", label: "Steckbrief · " + TEIL_NAMEN[teil], button: "Verstanden",
      prompt: h("div", h("p.small.muted", "So sieht die Arbeitsanweisung in der Prüfung ungefähr aus:"), renderText(t.anweisung, t.markierungen || [], { show: true }),
        t.markierungen?.length ? legend([...new Set(t.markierungen.map((m) => m.kat))]) : null,
        h("div", { html: md(helpText(t)) }), t.achtung ? h("p.callout", "⚠️ " + t.achtung) : null) });
  }
  let falleUsed = false, idx = 0;
  for (const it of pool) {
    const label = "Aufgabe verstehen · " + (TEIL_NAMEN[it.teil] || it.teil);
    items.push(mcItem(it, { ...it.frage, text: it.frage.text || "Was musst du hier tun?" }, label, false));
    // E: nur EIN Suchschritt pro Aufgabe – abwechselnd TUN und eine andere Kategorie
    const kats = [...new Set((it.markierungen || []).map((m) => m.kat))];
    const kat = idx % 2 === 0 && kats.includes("tun") ? "tun" : shuffle(kats.filter((k) => k !== "tun"))[0] || "tun";
    const withFalle = !falleUsed && it.falle?.optionen?.length;
    if (kats.length) items.push(findItem(it, kat, label + " · Welches Wort zeigt das?", withFalle ? "" : helpText(it)));
    if (withFalle) {
      falleUsed = true;
      const fi = mcItem(it, it.falle, label + " · Falle", false);
      fi.explain = (fi.explain ? fi.explain + "\n\n" : "") + helpText(it);
      items.push(fi);
    }
    idx++;
  }
  const res = await runQuiz(el, { title: "Aufgaben verstehen", items, retryWrong: false });
  const xp = res.aborted ? res.score : res.score + 5;
  if (!res.aborted) for (const it of pool) await store.addAttempt({ modul: "aufgaben", itemId: it.id, xp: 0, meta: { ohneWertung: true } });
  await store.addAttempt({ modul: "aufgaben", itemId: "runde", score: res.score, max: res.max, sec: res.sec, xp, meta: { ohneWertung: true } });
  if (!embedded && !res.aborted) await resultScreen(el, { title: "Aufgaben verstanden!", score: res.score, max: res.max, xp, extra: h("p.small.muted", "Tipp: Unter „Wörter in Aufgaben“ übst du die schwierigen Arbeitsanweisungs-Wörter.") });
  return { ...res, xp };
}

/** Wörter aus Aufgabenstellungen: Distraktoren aus „verwechslung“ und derselben Gruppe (Minimalpaare). */
export async function glossarRound(el, { n = 10, gruppe } = {}) {
  const d = await data();
  const gl = d.glossar.filter((g) => !gruppe || (g.gruppe || g.typ) === gruppe);
  if (gl.length < 4) {
    clear(el).append(emptyBox("Das Glossar wird gerade erstellt."));
    return { aborted: true };
  }
  const byWort = new Map(d.glossar.map((g) => [String(g.wort).toLowerCase(), g]));
  const items = sample(gl, Math.min(n, gl.length)).map((g) => {
    const verw = (g.verwechslung || []).map((w) => byWort.get(String(w).toLowerCase())).filter((x) => x && x.id !== g.id);
    const same = shuffle(d.glossar.filter((x) => x.id !== g.id && (x.gruppe || x.typ) === (g.gruppe || g.typ) && !verw.includes(x)));
    const rest = shuffle(d.glossar.filter((x) => x.id !== g.id && !verw.includes(x) && !same.includes(x)));
    const others = [...verw, ...same, ...rest].slice(0, 3).map((x) => x.erklaerung);
    return {
      label: "Wörter in Aufgabenstellungen",
      prompt: `Was bedeutet **${g.wort}** in einer Aufgabenstellung?` + (g.beispiel ? `\n\n_„${g.beispiel}“_` : ""),
      options: [g.erklaerung, ...others], correct: 0,
      explain: `**${g.wort}** = ${g.erklaerung}` + (g.nicht_verwechseln ? `\n\n⚠️ ${g.nicht_verwechseln}` : ""),
      onResult: async (ok, given) => { if (!ok) await store.addError({ modul: "aufgaben", kategorie: "aufgabe", itemRef: g.id, frage: `Was bedeutet **${g.wort}** in einer Aufgabenstellung?`, optionen: [g.erklaerung, ...others], loesung: 0, richtig: g.erklaerung, gegeben: given, erklaerung: g.nicht_verwechseln || g.beispiel || "" }); },
    };
  });
  const res = await runQuiz(el, { title: "Wörter in Aufgabenstellungen", items, retryWrong: false });
  const xp = res.score + 3;
  if (!res.aborted) {
    await store.addAttempt({ modul: "aufgaben", itemId: "glossar", score: res.score, max: res.max, sec: res.sec, xp, meta: { ohneWertung: true } });
    await resultScreen(el, { score: res.score, max: res.max, xp });
  }
  return res;
}

/** Mit eigenen Worten: Was musst du tun? (KI vergleicht mit der Musterbeschreibung; ohne Key: Selbstvergleich) */
export async function eigeneWorte(el) {
  const d = await data();
  const pool = d.items.filter((x) => x.einfach);
  if (!pool.length) { clear(el).append(emptyBox("Die Übungen werden gerade erstellt.")); return { aborted: true }; }
  const it = shuffle(pool).sort((a, b) => seenCount(a.id) - seenCount(b.id))[0];
  return new Promise((resolve) => {
    clear(el);
    const ta = h("textarea.answer", { rows: 5, placeholder: "Schreib oder diktiere (🎤): Was genau musst du tun? Was darf nicht fehlen?" });
    const out = h("div");
    const btn = h("button.btn.primary.wide", { onclick: async () => {
      const text = ta.value.trim();
      if (text.split(/\s+/).length < 6) return toast("Bitte mindestens einen ganzen Satz.");
      btn.remove();
      const av = await ai.available();
      if (av.ok) {
        out.append(thinking(h("p", "Tarsi vergleicht …")));
        try {
          const { data: r } = await ai.call({
            system: "Du bist eine freundliche Deutschlehrerin (Prüfungsvorbereitung telc C1 Hochschule). Die Lernerin hat mit eigenen Worten beschrieben, was eine Prüfungsaufgabe von ihr verlangt. Prüfe, ob sie die Aufgabe vollständig und richtig verstanden hat (Was tun? Was muss rein? Wie viel? Einschränkungen? Für wen/welche Form?). Antworte auf Deutsch, sehr einfach (B1), freundlich, kurz.",
            messages: [{ role: "user", content: `AUFGABENSTELLUNG:\n${it.anweisung}\n\nRICHTIG VERSTANDEN HEISST (Musterbeschreibung):\n${it.einfach}\nSchritte: ${(it.schritte || []).join(" | ")}\nWichtige Stellen: ${(it.markierungen || []).map((m) => m.text).join(" | ")}\n\nBESCHREIBUNG DER LERNERIN:\n${text}` }],
            schema: S.obj({ verstanden: S.enm("ja", "teilweise", "nein"), richtig: S.arr(S.str), fehlt_oder_falsch: S.arr(S.str), tipp: S.str }),
            maxTokens: 4000, effort: "low",
          });
          clear(out).append(h("div.feedback" + (r.verstanden === "ja" ? ".ok" : ".no"),
            h("div.fb-head", mascot(r.verstanden === "ja" ? "cheer" : "think", 54), h("div.fb-title", { ja: "Genau richtig verstanden!", teilweise: "Fast – ein Punkt fehlt noch", nein: "Da ist etwas missverstanden" }[r.verstanden])),
            r.richtig?.length ? h("div.fb-exp", h("strong", "Richtig: "), r.richtig.join(" · ")) : null,
            r.fehlt_oder_falsch?.length ? h("div.fb-exp", h("strong", "Fehlt / falsch: "), r.fehlt_oder_falsch.join(" · ")) : null,
            h("div.fb-exp", "💡 " + r.tipp)),
            h("details", h("summary", "Musterbeschreibung"), h("div.model-text", { html: md(helpText(it)) })));
          return finish(r.verstanden === "ja");
        } catch (e) {
          toast(e instanceof AiUnavailable ? e.message : "KI-Vergleich nicht möglich");
        }
      }
      clear(out).append(h("p.small.muted", av.ok ? "" : av.msg), h("div.card", h("strong", "Vergleiche mit der Musterbeschreibung:"), h("div", { html: md(helpText(it)) })),
        h("div.row", h("button.btn.bad", { onclick: () => finish(false) }, "Ich hatte etwas falsch"), h("button.btn.good", { onclick: () => finish(true) }, "Hatte ich richtig")));
    } }, "Vergleichen");
    async function finish(ok) {
      await store.addAttempt({ modul: "aufgaben", itemId: it.id, score: ok ? 1 : 0, max: 1, xp: 5, meta: { eigeneWorte: true, ohneWertung: true } });
      if (!ok) await store.addError({ modul: "aufgaben", kategorie: "aufgabe", itemRef: it.id + ":worte", frage: `Was musst du hier tun?\n\n_${it.anweisung}_`, richtig: it.einfach, gegeben: ta.value.trim(), erklaerung: (it.schritte || []).join(" · "), typ: "self" });
      out.querySelectorAll(".row").forEach((r) => r.remove());
      out.append(h("button.btn.primary.wide", { onclick: () => resolve({ score: ok ? 1 : 0, max: 1, xp: 5 }) }, "Weiter"));
    }
    el.append(h("div.ex-head", h("button.icon-btn", { onclick: () => resolve({ aborted: true }) }, "✕"), h("strong", "Mit eigenen Worten"), h("span")),
      h("div.chip", TEIL_NAMEN[it.teil] || it.teil),
      strategyCard(true),
      h("p", { html: md("Lies die Aufgabe und erkläre in **einfachen Worten**, was du tun musst. Beantworte dabei die 5 Fragen.") }),
      h("div.atext.plain", it.anweisung.split("\n").map((l) => h("p", l))), zitateBox(it), ta, btn, out);
  });
}

/** „❓ Was muss ich tun?“ – Knopf für alle Prüfungsteile (allgemein oder zur konkreten Aufgabe via ref). */
export function taskHelpButton(teil, ref) {
  return h("button.btn.small.help-btn", { onclick: async (e) => { e.stopPropagation(); await showTaskHelp(teil, ref); } }, "❓ Was muss ich tun?");
}

export async function showTaskHelp(teil, ref) {
  const d = await data();
  const spec = ref ? d.items.find((x) => x.ref === ref) : null;
  const t = d.teile.find((x) => x.teil === teil);
  const src = spec || t;
  if (!src) return toast("Hilfe wird gerade erstellt.");
  const marks = src.markierungen || [];
  const glossar = (t?.woerter || []).map((w) => d.glossar.find((g) => g.wort.toLowerCase() === String(w).toLowerCase())).filter(Boolean);
  const body = h("div.task-help",
    h("div.tarsi-says", mascot("think", 64), h("div.speech", src.einfach)),
    marks.length ? h("div", h("strong", "Darauf kommt es an:"), h("ul.marks", marks.map((m) => h("li", h("span.leg.k-" + m.kat, KAT[m.kat]?.icon + " " + m.text), m.warum ? " – " + m.warum : "")))) : null,
    src.schritte?.length ? h("div", h("strong", "So gehst du vor:"), h("ol", src.schritte.map((s) => h("li", s)))) : null,
    spec?.woerter?.length ? h("div", h("strong", "Schwierige Wörter:"), h("ul", spec.woerter.map((w) => h("li", h("strong", w.wort), " = ", w.erklaerung)))) : null,
    t?.achtung ? h("p.callout", "⚠️ " + t.achtung) : null,
    glossar.length ? h("details", h("summary", "Wörter aus der Arbeitsanweisung"), h("ul", glossar.map((g) => h("li", h("strong", g.wort), " = ", g.erklaerung)))) : null);
  await modal(`Was muss ich tun? · ${TEIL_NAMEN[teil] || ""}`, body, [{ label: "Alles klar", primary: true }]);
}

export async function steckbriefe(el) {
  const d = await data();
  el.append(h("div.list", d.teile.map((t) => h("button.list-item", { onclick: () => showTaskHelp(t.teil) }, h("div", h("strong", TEIL_NAMEN[t.teil] || t.teil), h("div.small.muted", (t.einfach || "").slice(0, 80) + "…"))))));
}

export async function glossarList(el) {
  const d = await data();
  const q = h("input.search", { type: "search", placeholder: "Wort suchen …" });
  const list = h("div.list");
  const G = { operator: "Arbeitsauftrag", anweisung: "Anweisung", pruefung: "Prüfung", autor: "Was der Autor tut" };
  const render = () => {
    clear(list);
    const term = q.value.trim().toLowerCase();
    for (const g of d.glossar.filter((x) => !term || (x.wort + x.erklaerung).toLowerCase().includes(term))) {
      list.append(h("details.entry", h("summary", h("span", g.wort), h("span.chip.soft", G[g.gruppe || g.typ] || g.gruppe || g.typ)),
        h("p", g.erklaerung), g.beispiel ? h("p.beispiel", "„" + g.beispiel + "“") : null, g.nicht_verwechseln ? h("p.small", "⚠️ " + g.nicht_verwechseln) : null));
    }
  };
  q.addEventListener("input", render);
  el.append(q, list);
  render();
}
