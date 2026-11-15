// „Aufgaben verstehen“: Arbeitsanweisungen genau lesen, Schlüsselwörter erkennen, mit eigenen Worten sagen, was zu tun ist.
// Inhalte: data/aufgaben.json (teile, aufgaben, glossar) und data/aufgaben_spezifisch.json (je Schreib-/Sprechaufgabe der App).
import { h, clear, md, shuffle, sample, toast, modal } from "./ui.js";
import { load } from "./content.js";
import { store } from "./store.js";
import { runQuiz, resultScreen } from "./quiz.js";
import { ai, S, AiUnavailable } from "./ai.js";
import { emptyBox, mascot, thinking } from "./mascot.js";

export const TEIL_NAMEN = {
  lv1: "Lesen 1", lv2: "Lesen 2", lv3: "Lesen 3", sb: "Sprachbausteine", hv1: "Hören 1", hv2: "Hören 2", hv3: "Hören 3",
  sa: "Schreiben", mp1a: "Präsentation", mp1b: "Anschlussfragen", mp2: "Diskussion",
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

function quote(text) {
  return h("blockquote.anweisung", text);
}

function helpText(it) {
  const parts = [`**Einfach gesagt:** ${it.einfach}`];
  if (it.schritte?.length) parts.push("**So gehst du vor:**\n" + it.schritte.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  if (it.woerter?.length) parts.push("**Wörter:** " + it.woerter.map((w) => `**${w.wort}** = ${w.erklaerung}`).join(" · "));
  return parts.join("\n\n");
}

/** Übungsrunde: pro Aufgabenstellung Schlüsselwörter antippen + „Was musst du tun?“ (+ Falle). */
export async function aufgabenRound(el, { n = 5, teil, embedded } = {}) {
  const d = await data();
  let pool = d.items.filter((x) => !teil || x.teil === teil);
  if (!pool.length) {
    clear(el).append(emptyBox("Die Übungen zu Aufgabenstellungen werden gerade erstellt."));
    return { aborted: true, empty: true };
  }
  pool = shuffle(pool).sort((a, b) => seenCount(a.id) - seenCount(b.id)).slice(0, n);
  const items = [];
  for (const it of pool) {
    const label = "Aufgabe verstehen · " + (TEIL_NAMEN[it.teil] || it.teil);
    const logErr = async (frage, richtig, gegeben, erklaerung, optionen, loesung) => {
      await store.addError({ modul: "aufgaben", kategorie: "aufgabe", itemRef: it.id, frage, richtig, gegeben, erklaerung, optionen, loesung });
    };
    if (it.schluesselwoerter?.length) {
      items.push({
        type: "tap", label, text: it.anweisung, keys: it.schluesselwoerter,
        prompt: "Lies die Aufgabenstellung. **Tippe die Wörter an, die für die Lösung entscheidend sind.**",
        solution: it.schluesselwoerter.join(" · "),
        explain: helpText(it),
      });
    }
    if (it.frage?.optionen?.length) {
      const f = it.frage;
      items.push({
        label, prompt: h("div", quote(it.anweisung), h("div.prompt", { html: md(f.text || "Was musst du hier tun?") })),
        options: f.optionen, correct: f.loesung, explain: (f.erklaerung ? f.erklaerung + "\n\n" : "") + `**Einfach gesagt:** ${it.einfach}`,
        onResult: async (ok, given) => { if (!ok) await logErr(`Aufgabenstellung (${TEIL_NAMEN[it.teil]}):\n\n_${it.anweisung}_\n\n${f.text || "Was musst du tun?"}`, f.optionen[f.loesung], given, f.erklaerung || it.einfach, f.optionen, f.loesung); },
      });
    }
    if (it.falle?.optionen?.length) {
      const f = it.falle;
      items.push({
        label, prompt: h("div", quote(it.anweisung), h("div.prompt", { html: md(f.text) })),
        options: f.optionen, correct: f.loesung, explain: f.erklaerung || "",
        onResult: async (ok, given) => { if (!ok) await logErr(`Aufgabenstellung (${TEIL_NAMEN[it.teil]}):\n\n_${it.anweisung}_\n\n${f.text}`, f.optionen[f.loesung], given, f.erklaerung || "", f.optionen, f.loesung); },
      });
    }
  }
  const res = await runQuiz(el, { title: "Aufgaben verstehen", items, intro: "Viele Punkte gehen verloren, weil die Aufgabe nicht genau gelesen wurde. Hier übst du genau das." });
  const xp = res.aborted ? res.score : res.score + 5;
  if (!res.aborted) for (const it of pool) await store.addAttempt({ modul: "aufgaben", itemId: it.id, xp: 0, meta: { ohneWertung: true } });
  await store.addAttempt({ modul: "aufgaben", itemId: "runde", score: res.score, max: res.max, sec: res.sec, xp, meta: { ohneWertung: true } });
  if (!embedded && !res.aborted) await resultScreen(el, { title: "Aufgaben verstanden!", score: res.score, max: res.max, xp });
  return { ...res, xp };
}

/** Wörter aus Aufgabenstellungen (Glossar) als Quiz. */
export async function glossarRound(el, { n = 10 } = {}) {
  const d = await data();
  if (d.glossar.length < 4) {
    clear(el).append(emptyBox("Das Glossar wird gerade erstellt."));
    return { aborted: true };
  }
  const pick = sample(d.glossar, Math.min(n, d.glossar.length));
  const items = pick.map((g) => {
    const others = sample(d.glossar.filter((x) => x.id !== g.id), 3).map((x) => x.erklaerung);
    return {
      label: "Wörter in Aufgabenstellungen",
      prompt: `Was bedeutet **${g.wort}** in einer Aufgabenstellung?` + (g.beispiel ? `\n\n_„${g.beispiel}“_` : ""),
      options: [g.erklaerung, ...others], correct: 0,
      explain: `**${g.wort}** = ${g.erklaerung}` + (g.nicht_verwechseln ? `\n\n⚠️ ${g.nicht_verwechseln}` : ""),
      onResult: async (ok, given) => { if (!ok) await store.addError({ modul: "aufgaben", kategorie: "aufgabe", itemRef: g.id, frage: `Was bedeutet **${g.wort}** in einer Aufgabenstellung?`, optionen: [g.erklaerung, ...others], loesung: 0, richtig: g.erklaerung, gegeben: given, erklaerung: g.beispiel || "" }); },
    };
  });
  const res = await runQuiz(el, { title: "Wörter in Aufgabenstellungen", items });
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
            system: "Du bist eine freundliche Deutschlehrerin (Prüfungsvorbereitung telc C1 Hochschule). Die Lernerin hat mit eigenen Worten beschrieben, was eine Prüfungsaufgabe von ihr verlangt. Prüfe, ob sie die Aufgabe vollständig und richtig verstanden hat. Antworte auf Deutsch, sehr einfach (B1/B2), freundlich.",
            messages: [{ role: "user", content: `AUFGABENSTELLUNG:\n${it.anweisung}\n\nRICHTIG VERSTANDEN HEISST (Musterbeschreibung):\n${it.einfach}\nSchritte: ${(it.schritte || []).join(" | ")}\n\nBESCHREIBUNG DER LERNERIN:\n${text}` }],
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
      h("p", "Lies die Aufgabenstellung und erkläre in **einfachen Worten**, was du tun musst."),
      quote(it.anweisung), ta, btn, out);
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
  if (!spec && !t) return toast("Hilfe wird gerade erstellt.");
  const glossar = (t?.woerter || []).map((w) => d.glossar.find((g) => g.wort.toLowerCase() === String(w).toLowerCase())).filter(Boolean);
  const body = h("div.task-help",
    h("div.tarsi-says", mascot("think", 64), h("div.speech", (spec || t).einfach)),
    (spec || t).schritte?.length ? h("div", h("strong", "So gehst du vor:"), h("ol", (spec || t).schritte.map((s) => h("li", s)))) : null,
    spec?.woerter?.length ? h("div", h("strong", "Schwierige Wörter:"), h("ul", spec.woerter.map((w) => h("li", h("strong", w.wort), " = ", w.erklaerung)))) : null,
    t?.achtung ? h("p.callout", "⚠️ " + t.achtung) : null,
    glossar.length ? h("details", h("summary", "Wörter aus der Arbeitsanweisung"), h("ul", glossar.map((g) => h("li", h("strong", g.wort), " = ", g.erklaerung)))) : null);
  await modal(`Was muss ich tun? · ${TEIL_NAMEN[teil] || ""}`, body, [{ label: "Alles klar", primary: true }]);
}

export async function glossarList(el) {
  const d = await data();
  const q = h("input.search", { type: "search", placeholder: "Wort suchen …" });
  const list = h("div.list");
  const render = () => {
    clear(list);
    const term = q.value.trim().toLowerCase();
    for (const g of d.glossar.filter((x) => !term || (x.wort + x.erklaerung).toLowerCase().includes(term))) {
      list.append(h("details.entry", h("summary", h("span", g.wort), h("span.chip.soft", { operator: "Arbeitsauftrag", anweisung: "Anweisung", pruefung: "Prüfung" }[g.typ] || g.typ)),
        h("p", g.erklaerung), g.beispiel ? h("p.beispiel", "„" + g.beispiel + "“") : null, g.nicht_verwechseln ? h("p.small", "⚠️ " + g.nicht_verwechseln) : null));
    }
  };
  q.addEventListener("input", render);
  el.append(q, list);
  render();
}
