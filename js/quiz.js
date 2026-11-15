// Generischer Übungs-Player im Duolingo-Stil: eine Aufgabe pro Bildschirm, sofortiges Feedback mit
// Begründung, falsch beantwortete Aufgaben kommen am Ende noch einmal (zählen aber nur beim ersten Versuch).
import { h, clear, md, norm, progressBar, confetti, shuffle } from "./ui.js";
import { mascot } from "./mascot.js";
import { praise, comfort } from "./gamify.js";
import { speakOnce } from "./tts.js";

/**
 * item: {
 *   prompt: string (Markdown) | Node, hint?: string, speak?: string,
 *   type?: "mc" | "input" | "self",
 *   options?: string[], correct?: number,            // mc
 *   accept?: string[], solution?: string,            // input
 *   explain?: string, onResult?: (ok, given) => Promise|void
 * }
 * @returns {Promise<{score:number, max:number, sec:number, results:Array, aborted?:boolean}>}
 */
export function runQuiz(el, { title, items, intro, retryWrong = true, onExit }) {
  return new Promise((resolve) => {
    const started = Date.now();
    // Intro-Karten (type "intro") werden nur gezeigt, nicht gewertet
    let si = 0;
    const queue = items.map((it) => ({ ...it, _i: it.type === "intro" ? -1 : si++, _first: true }));
    const scored = si;
    const firstResult = new Array(scored).fill(null);
    let done = 0;

    const finish = (aborted = false) => {
      const score = firstResult.filter((x) => x === true).length;
      resolve({ score, max: scored, sec: Math.round((Date.now() - started) / 1000), results: firstResult, aborted });
    };

    const header = () =>
      h("div.quiz-head",
        h("button.icon-btn", { "aria-label": "Beenden", onclick: () => { onExit && onExit(); finish(true); } }, "✕"),
        progressBar(done, scored + (queue.filter((q) => !q._first).length), "grow"),
        h("span.muted.small", `${Math.min(done + 1, scored)}/${scored}`));

    const next = () => {
      if (!queue.length) return finish();
      const it = queue.shift();
      clear(el);
      el.append(header());
      if (title) el.append(h("div.quiz-title", title));
      if (intro && it._i === 0 && it._first) el.append(h("p.muted", intro));
      const card = h("div.quiz-card");
      if (it.label) card.append(h("div.chip", it.label));
      card.append(typeof it.prompt === "string" ? h("div.prompt", { html: md(it.prompt) }) : it.prompt);
      if (it.speak) card.append(h("button.btn.small.ghost", { onclick: () => speakOnce(it.speak) }, "🔊 Vorlesen"));
      if (it.hint) card.append(h("p.muted.small", { html: md(it.hint) }));
      el.append(card);
      const foot = h("div.quiz-foot");
      el.append(foot);

      const settle = async (ok, given) => {
        if (it._first) {
          firstResult[it._i] = ok;
          done++;
          if (it.onResult) await it.onResult(ok, given);
        }
        if (!ok && retryWrong && it._first) queue.push({ ...it, _first: false });
        else if (!it._first && ok) done = Math.min(done, items.length);
        showFeedback(foot, ok, it, given);
      };

      const type = it.type || (it.options ? "mc" : "input");
      if (type === "intro") {
        card.classList.add("intro-card");
        const go = h("button.btn.primary.wide", { onclick: next }, it.button || "Verstanden – weiter");
        foot.append(go);
        return;
      }
      if (type === "custom") {
        // Eigene Darstellung (z. B. „Aufgaben verstehen“): render() baut die Karte und ruft settle(ok, given) auf
        it.render({ card, foot, settle });
        return;
      }
      if (type === "tap") {
        // Schlüsselwörter antippen: Text in Wortgruppen zerlegt; Ziel sind die Wörter aus it.keys
        const keys = (it.keys || []).map((k) => norm(k));
        const tokens = String(it.text).split(/(\s+)/).filter((t) => t.trim());
        const keyIdx = new Set();
        // Token-Positionen markieren, die zu einem Schlüsselbegriff gehören
        const low = tokens.map((t) => norm(t));
        keys.forEach((k) => {
          const parts = k.split(" ").filter(Boolean);
          for (let i = 0; i + parts.length <= low.length; i++) {
            if (parts.every((p, j) => low[i + j] === p)) for (let j = 0; j < parts.length; j++) keyIdx.add(i + j);
          }
        });
        const sel = new Set();
        const box = h("div.tapwords", tokens.map((t, i) => h("button.tapword", { onclick: (e) => {
          if (box.dataset.locked) return;
          sel.has(i) ? sel.delete(i) : sel.add(i);
          e.currentTarget.classList.toggle("sel");
        } }, t)));
        card.append(box);
        const check = h("button.btn.primary.wide", { onclick: () => {
          if (!sel.size) return;
          box.dataset.locked = "1";
          check.remove();
          const hit = [...keyIdx].filter((i) => sel.has(i)).length;
          const extra = [...sel].filter((i) => !keyIdx.has(i)).length;
          const recall = keyIdx.size ? hit / keyIdx.size : 1;
          const ok = recall >= 0.6 && extra <= Math.max(3, keyIdx.size);
          [...box.children].forEach((b, i) => {
            if (keyIdx.has(i)) b.classList.add(sel.has(i) ? "right" : "missed");
            else if (sel.has(i)) b.classList.add("extra");
          });
          settle(ok, `${hit}/${keyIdx.size}`);
        } }, "Prüfen");
        foot.append(check);
        return;
      }
      if (type === "mc") {
        const order = it.keepOrder ? it.options.map((_, i) => i) : shuffle(it.options.map((_, i) => i));
        const opts = h("div.options");
        order.forEach((oi) => {
          const b = h("button.option", { onclick: () => {
            if (opts.dataset.locked) return;
            opts.dataset.locked = "1";
            const ok = oi === it.correct;
            b.classList.add(ok ? "right" : "wrong");
            if (!ok) opts.querySelectorAll(".option")[order.indexOf(it.correct)]?.classList.add("right");
            settle(ok, it.options[oi]);
          } }, it.options[oi]);
          opts.append(b);
        });
        card.append(opts);
      } else if (type === "input") {
        const inp = h("textarea.answer", { rows: 2, placeholder: "Antwort eingeben …", autocapitalize: "off", spellcheck: false });
        const check = h("button.btn.primary.wide", { onclick: () => {
          const given = inp.value.trim();
          if (!given) return inp.focus();
          const ok = [it.solution, ...(it.accept || [])].some((a) => norm(a) === norm(given));
          inp.disabled = true;
          check.remove();
          if (!ok) {
            // Selbstbestätigung bei abweichender, aber evtl. richtiger Formulierung
            showFeedback(foot, false, it, given, async () => {
              await settle(true, given);
            }, () => settle(false, given));
            return;
          }
          settle(true, given);
        } }, "Prüfen");
        card.append(inp);
        foot.append(check);
        setTimeout(() => inp.focus(), 50);
      } else if (type === "self") {
        // Lösung zeigen, Lernerin bewertet selbst
        const show = h("button.btn.primary.wide", { onclick: () => {
          show.remove();
          card.append(h("div.solution", { html: md(it.solution || "") }));
          foot.append(h("div.row",
            h("button.btn.bad", { onclick: () => settle(false, "") }, "Wusste ich nicht"),
            h("button.btn.good", { onclick: () => settle(true, "") }, "Wusste ich")));
        } }, "Lösung zeigen");
        foot.append(show);
      }
    };

    function showFeedback(foot, ok, it, given, onAcceptAnyway, onReject) {
      clear(foot);
      const box = h("div.feedback" + (ok ? ".ok" : ".no"),
        h("div.fb-head", mascot(ok ? "cheer" : onAcceptAnyway ? "think" : "sad", 54, ok ? "bounce" : "wiggle"),
          h("div.fb-title", ok ? praise() : onAcceptAnyway ? "Nicht exakt die erwartete Lösung" : comfort())),
        !ok && (it.solution || it.options) ? h("div.fb-sol", h("span.muted", "Richtig: "), h("strong", it.solution || it.options[it.correct])) : null,
        it.explain ? h("div.fb-exp", { html: md(it.explain) }) : null);
      foot.append(box);
      if (onAcceptAnyway) {
        foot.append(h("div.row",
          h("button.btn.bad", { onclick: () => { clear(foot); onReject(); } }, "War falsch"),
          h("button.btn.good", { onclick: () => { clear(foot); onAcceptAnyway(); } }, "Meine Lösung stimmt auch")));
        return;
      }
      const btn = h("button.btn.wide" + (ok ? ".good" : ".primary"), { onclick: next }, "Weiter");
      foot.append(btn);
      setTimeout(() => btn.focus({ preventScroll: true }), 30);
    }

    next();
  });
}

/** Abschlussbildschirm nach einer Übung. */
export function resultScreen(el, { title = "Geschafft!", score, max, xp, extra, onDone, doneLabel = "Weiter" }) {
  return new Promise((resolve) => {
    clear(el);
    const p = max ? Math.round((score / max) * 100) : null;
    if (p == null || p >= 70) confetti();
    el.append(h("div.result",
      mascot(p == null || p >= 85 ? "cheer" : p >= 60 ? "proud" : "happy", 130, "bounce"),
      h("h2", title),
      p != null ? h("div.result-score", `${score} / ${max}`, h("span.muted", ` (${p} %)`)) : null,
      xp ? h("div.xp-pill", `+${xp} XP`) : null,
      p != null ? h("p.muted", p >= 85 ? praise() : p >= 60 ? "Solide! Die Fehler landen im Fehlerprotokoll." : comfort()) : null,
      extra || null,
      h("button.btn.primary.wide", { onclick: () => { onDone && onDone(); resolve(); } }, doneLabel)));
  });
}
