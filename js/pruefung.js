// Probeprüfung / Generalprobe mit Originalablauf und -zeiten, Auswertung mit Punkten je Teil.
// Verwendet ausschließlich die für Probeprüfung n reservierten Aufgaben (pruefung: n).
// Fortschritt wird nach jedem Teil gespeichert – Pausen zwischen den Teilen sind möglich.
import { h, clear, confirmBox, confetti } from "./ui.js";
import { mascot, emptyBox } from "./mascot.js";
import { load, reserved } from "./content.js";
import { db } from "./db.js";
import { store } from "./store.js";
import { sbExam } from "./sb.js";
import { lesenExam } from "./lesen.js";
import { hoerenExam } from "./hoeren.js";
import { schreibenTask } from "./schreiben.js";
import { praesentation, diskussion } from "./sprechen.js";
import { PASS } from "./analytics.js";

const NOTEN = [[193, "sehr gut"], [172, "gut"], [151, "befriedigend"], [128, "ausreichend"]];

async function plan(nr) {
  const [lesen, sb, hoeren, schreiben, sprechen] = await Promise.all(["lesen", "sb", "hoeren", "schreiben", "sprechen"].map(load));
  const L = reserved(lesen, nr), H = reserved(hoeren, nr);
  return [
    { id: "lv1", name: "Lesen Teil 1", block: "schriftlich", max: 12, run: (el) => run(lesenExam, el, L.find((x) => x.teil === "lv1")) },
    { id: "lv2", name: "Lesen Teil 2", block: "schriftlich", max: 12, run: (el) => run(lesenExam, el, L.find((x) => x.teil === "lv2")) },
    { id: "lv3", name: "Lesen Teil 3", block: "schriftlich", max: 24, run: (el) => run(lesenExam, el, L.find((x) => x.teil === "lv3")) },
    { id: "sb", name: "Sprachbausteine", block: "schriftlich", max: 22, run: (el) => { const s = reserved(sb, nr)[0]; return s ? sbExam(el, s, { mode: "pruefung", minutes: 25 }) : missing(el); } },
    { id: "pause", name: "Pause (20 Min.)", block: "schriftlich", max: 0, run: pause },
    { id: "hv1", name: "Hören Teil 1", block: "schriftlich", max: 8, run: (el) => run(hoerenExam, el, H.find((x) => x.teil === "hv1")) },
    { id: "hv2", name: "Hören Teil 2", block: "schriftlich", max: 20, run: (el) => run(hoerenExam, el, H.find((x) => x.teil === "hv2")) },
    { id: "hv3", name: "Hören Teil 3", block: "schriftlich", max: 20, run: (el) => run(hoerenExam, el, H.find((x) => x.teil === "hv3")) },
    { id: "sa", name: "Schriftlicher Ausdruck (70 Min.)", block: "schriftlich", max: 48, run: (el) => { const t = reserved(schreiben, nr); return t.length ? schreibenTask(el, t, { mode: "pruefung", minutes: 70 }) : missing(el); } },
    { id: "mp1", name: "Mündlich: Vorbereitung + Präsentation 1A/1B", block: "muendlich", max: 0, run: (el) => { const b = reserved(sprechen.praesentation, nr)[0]; return b ? praesentation(el, b) : missing(el); } },
    { id: "mp2", name: "Mündlich: Diskussion Teil 2", block: "muendlich", max: 0, run: (el) => { const d = reserved(sprechen.diskussion, nr)[0]; return d ? diskussion(el, d, { turns: 6 }) : missing(el); } },
  ];
}

function run(fn, el, item) {
  return item ? fn(el, item, { mode: "pruefung" }) : missing(el);
}
function missing(el) {
  clear(el).append(emptyBox("Diese Aufgabe ist noch nicht vorhanden – Teil wird übersprungen."));
  return new Promise((r) => el.append(h("button.btn.primary.wide", { onclick: () => r({ skipped: true }) }, "Weiter")));
}
function pause(el) {
  clear(el);
  return new Promise((r) => el.append(h("div.result", mascot("sleep", 120), h("h2", "20 Minuten Pause"), h("p", "Wie in der Prüfung: kurz bewegen, etwas trinken, nicht mehr in Aufgaben schauen."), h("button.btn.primary.wide", { onclick: () => r({ skipped: true }) }, "Weiter zum Hören"))));
}

/**
 * @param {number} nr 1–3
 * @param {"schriftlich"|"muendlich"|undefined} teil
 */
export async function generalprobe(el, nr, teil) {
  const key = "mock." + nr;
  const state = (await db.kvGet(key)) || { results: {}, started: Date.now() };
  const parts = (await plan(nr)).filter((p) => !teil || p.block === teil);
  while (true) {
    const next = parts.find((p) => !(p.id in state.results));
    clear(el);
    const go = await new Promise((resolve) => el.append(
      h("div.ex-head", h("button.icon-btn", { onclick: () => resolve(false) }, "✕"), h("strong", `Generalprobe ${nr}` + (teil ? ` – ${teil}` : "")), h("span")),
      h("p.muted", "Originalablauf und -zeiten. Nach jedem Teil wird gespeichert – du kannst pausieren."),
      h("ol.steps", parts.map((p) => h("li" + (p.id in state.results ? ".done" : ""), h("span", p.name), p.id in state.results && state.results[p.id]?.max ? h("span", `${state.results[p.id].score}/${state.results[p.id].max}`) : p.id in state.results ? h("span", "✓") : null))),
      next ? h("button.btn.primary.wide", { onclick: () => resolve(true) }, `Starten: ${next.name}`) : h("button.btn.primary.wide", { onclick: () => resolve(true) }, "Auswertung ansehen"),
      Object.keys(state.results).length ? h("button.btn.ghost.wide", { onclick: async () => { if (await confirmBox("Neu beginnen?", "Alle Ergebnisse dieser Generalprobe werden zurückgesetzt.")) { await db.kvDel(key); resolve("reset"); } } }, "Neu beginnen") : null));
    if (go === "reset") return generalprobe(el, nr, teil);
    if (!go) return { aborted: true };
    if (!next) break;
    const r = await next.run(el);
    if (r?.aborted) continue;
    state.results[next.id] = r?.skipped ? { skipped: true } : { score: r.score, max: r.max };
    await db.kvSet(key, state);
  }
  return auswertung(el, nr, state, teil);
}

async function auswertung(el, nr, state, teil) {
  const R = state.results;
  const sum = (ids) => ids.reduce((s, id) => s + (R[id]?.score || 0), 0);
  const lesen = sum(["lv1", "lv2", "lv3"]), sb = sum(["sb"]), hoeren = sum(["hv1", "hv2", "hv3"]), schreiben = sum(["sa"]);
  // Mündlich: Teilergebnisse (0–max) auf 48 hochrechnen (Aussprache nicht bewertbar → anteilig)
  const mParts = ["mp1", "mp2"].map((id) => R[id]).filter((x) => x && x.max);
  const muendlich = mParts.length ? Math.round((mParts.reduce((s, x) => s + x.score / x.max, 0) / mParts.length) * 48 * 2) / 2 : null;
  const written = lesen + sb + hoeren + schreiben;
  const total = muendlich != null ? written + muendlich : null;
  const writtenOk = written >= PASS.written;
  const oralOk = muendlich != null ? muendlich >= PASS.oral : null;
  const passed = total != null && writtenOk && oralOk && total >= PASS.total;
  const note = passed ? NOTEN.find(([min]) => total >= min)?.[1] : null;
  if (!teil || teil === "muendlich") {
    if (!store.attempts.some((a) => a.modul === "pruefung" && a.itemId === "mock" + nr)) {
      await store.addAttempt({ modul: "pruefung", itemId: "mock" + nr, score: total ?? written, max: total != null ? 214 : 166, xp: 100, meta: { lesen, sb, hoeren, schreiben, muendlich, ohneWertung: true } });
    }
  }
  if (passed) confetti();
  clear(el);
  const row = (name, v, max, min) => h("div.cat-row", h("div.cat-name", name, h("span.muted.small", ` ${v} / ${max}`)), h("div.bar" + (v / max >= 0.6 ? ".good" : ".bad"), h("span", { style: { width: Math.min(100, (v / max) * 100) + "%" } }), h("i.mark60")));
  return new Promise((resolve) => el.append(
    h("div.result", mascot(passed ? "cheer" : "think", 130, "bounce"), h("h2", `Generalprobe ${nr}: Auswertung`)),
    h("div.card",
      row("Leseverstehen", lesen, 48), row("Sprachbausteine", sb, 22), row("Hörverstehen", hoeren, 48), row("Schriftlicher Ausdruck", schreiben, 48),
      h("p", h("strong", `Schriftlich: ${written} / 166`), writtenOk ? " ✅" : ` ❌ (nötig: ${PASS.written})`),
      muendlich != null ? row("Mündlicher Ausdruck (Schätzung)", muendlich, 48) : null,
      muendlich != null ? h("p", h("strong", `Mündlich: ${muendlich} / 48`), oralOk ? " ✅" : ` ❌ (nötig: ${PASS.oral})`) : h("p.muted", "Mündlicher Teil noch offen."),
      total != null ? h("p.big", `Gesamt: ${total} / 214 → ${passed ? "bestanden (" + note + ")" : "noch nicht bestanden"}`) : null),
    h("p.muted.small", "Ehrlicher Hinweis: Schreiben und Sprechen sind KI- bzw. Selbsteinschätzungen. Die echte Bewertung kann um eine Stufe abweichen."),
    h("button.btn.primary.wide", { onclick: () => resolve({ score: total ?? written, max: total != null ? 214 : 166, xp: 0 }) }, "Fertig")));
}
