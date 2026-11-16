// Einstieg: Router, Startseite, Lernpfad, Üben, Statistik, Mehr/Einstellungen.
import { h, clear, md, toast, confirmBox, progressBar, fmtTime } from "./ui.js";
import { emptyBox, tarsiSays, greetingLine, mascot } from "./mascot.js";
import { store, dayKey } from "./store.js";
import { db } from "./db.js";
import { CONFIG } from "./config.js";
import { ai, MODELS } from "./ai.js";
import { dropbox } from "./dropbox.js";
import { sync } from "./sync.js";
import { load, pool, THEMEN, KATEGORIEN } from "./content.js";
import { totalXp, levelInfo, streakInfo, todayXp, weekXp, daysUntilExam, studyMinutes, BADGES, earnedBadges, xpByDay, MAX_FREEZES, overallProgress, MEILENSTEINE, milestoneText } from "./gamify.js";
import { confetti, modal } from "./ui.js";
import { srsStats } from "./srs.js";
import { forecast, GROUPS, groupAccuracy, errorCategories, dueErrors, PASS, TEILE } from "./analytics.js";
import { lernpfad, currentDay, dayDone, unlockedUpTo, runDay, runStep, stepLabel, bonusRound, strategieKarte, einstufung, endspurtDay } from "./session.js";
import { srsRound, browseList, satzWerkstatt, matchRound } from "./vocab.js";
import { sbExam, drillRound, grammarCard } from "./sb.js";
import { lesenExam } from "./lesen.js";
import { hoerenExam } from "./hoeren.js";
import { schreibenTask, showFeedback, miniSchreiben, pickMini, MINI_TYPEN } from "./schreiben.js";
import { praesentation, diskussion } from "./sprechen.js";
import { errorReview, errorOverview } from "./fehler.js";
import { generalprobe } from "./pruefung.js";
import { aufgabenRound, glossarRound, eigeneWorte, glossarList, steckbriefe, strategyCard, TEIL_NAMEN } from "./aufgaben.js";
import { germanVoices, voicesReady, speakOnce, ttsSupported } from "./tts.js";

const main = document.getElementById("main");
const tabbar = document.getElementById("tabbar");
let busy = false; // während einer Übung keine Neuzeichnung durch Store-Events

export function nav(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ---------- Kopfleiste ----------
function topbar() {
  const s = streakInfo();
  const lv = levelInfo();
  const d = daysUntilExam();
  return h("header.topbar",
    h("div.pill", { title: "Streak" }, h("span.flame" + (s.activeToday ? ".on" : ""), "🔥"), h("b", s.streak), s.freezes ? h("span.small", " ❄️".repeat(s.freezes)) : null),
    h("div.pill", { title: "Level" }, "⭐ ", h("b", "Lv " + lv.level)),
    h("div.pill", { title: "Tage bis zur Prüfung" }, "🎓 ", h("b", d > 0 ? `${d} Tage` : d === 0 ? "Heute!" : "vorbei")),
    progressStrip());
}

// Gesamtfortschritt: dünner Streifen auf jeder Seite (antippen = Details)
function progressStrip() {
  const { pct } = overallProgress();
  return h("button.progress-strip", { "aria-label": `Gesamtfortschritt ${pct} Prozent`, onclick: () => showProgressDetails() },
    h("span.ps-label", "Weg zur Prüfung"), h("div.ps-bar", h("span", { style: { width: pct + "%" } })), h("b.ps-pct", pct + " %"));
}

function progressRing(pct) {
  const r = 52, c = 2 * Math.PI * r;
  return h("div.ring", { html: `<svg viewBox="0 0 120 120" role="img" aria-label="${pct} Prozent"><circle cx="60" cy="60" r="${r}" class="ring-bg"/><circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 60 60)"/></svg><div class="ring-txt"><b>${pct} %</b><span>geschafft</span></div>` });
}

function progressBreakdown() {
  const { parts } = overallProgress();
  return h("div.pb-list", parts.map((p) => h("div.pb-row", h("span", p.icon + " " + p.name), h("div.bar", h("span", { style: { width: Math.round(p.v * 100) + "%" } })), h("span.small", Math.round(p.v * 100) + " %"))));
}

function showProgressDetails() {
  const { pct } = overallProgress();
  modal("Weg zur Prüfung: " + pct + " %", h("div", h("p.small.muted", "So setzt sich dein Gesamtfortschritt zusammen (Lernpfad zählt am meisten):"), progressBreakdown()), [{ label: "Schließen", primary: true }]);
}

// Meilensteine (10/25/50/75/90/100 %) einmalig feiern
async function checkMilestone() {
  const { pct } = overallProgress();
  const last = (await db.kvGet("meilenstein", 0)) || 0;
  const reached = MEILENSTEINE.filter((m) => pct >= m && m > last);
  if (!reached.length) return;
  const m = reached[reached.length - 1];
  await db.kvSet("meilenstein", m);
  confetti();
  modal(`🎉 ${m} % geschafft!`, h("div.center", mascot("cheer", 120, "bounce"), h("p", milestoneText(m))), [{ label: "Weiter so!", primary: true }]);
}

// ---------- Startseite ----------
async function viewHome() {
  const days = await lernpfad();
  const allDone = days.every((d) => dayDone(d.tag));
  const day = allDone && daysUntilExam() > 0 ? endspurtDay(daysUntilExam()) : currentDay(days);
  const goal = store.settings.dailyGoalXp;
  const xpT = todayXp();
  const s = streakInfo();
  const done = !store.attempts.some((a) => a.modul === "einstufung");
  const due = dueErrors().length;
  const fc = forecast();
  const greet = new Date().getHours() < 11 ? "Guten Morgen" : new Date().getHours() < 18 ? "Hallo" : "Guten Abend";
  clear(main).append(
    topbar(),
    tarsiSays(greetingLine({ name: store.settings.name, streak: s.streak, activeToday: s.activeToday, xpToday: xpT, goal, dayNum: day.tag, daysLeft: daysUntilExam(), firstTime: done }), s.activeToday && xpT >= goal ? "cheer" : done ? "wave" : "happy"),
    h("button.card.progress-hero", { onclick: () => showProgressDetails() }, progressRing(overallProgress().pct),
      h("div", h("strong", "Dein Weg zur Prüfung"), h("p.small.muted", `Noch ${Math.max(0, daysUntilExam())} Tage bis zum 12.12. Jede Übung bringt dich weiter.`), h("span.small.link", "Details ansehen →"))),
    h("div.card.goal",
      h("div.row.between", h("strong", "Tagesziel"), h("span", `${xpT} / ${goal} XP`)),
      progressBar(xpT, goal, xpT >= goal ? "good" : ""),
      h("div.small.muted", xpT >= goal ? "✓ Tagesziel erreicht – stark!" : s.activeToday ? "Weiter so!" : "Heute noch nicht gelernt – deine Flamme wartet. 🔥")),
    done
      ? h("div.card.hero", h("h2", "🧭 Starte mit dem Einstufungstest"), h("p", "Ca. 25 Minuten. Danach weiß die App, worauf es bei dir ankommt."), h("button.btn.primary.wide", { onclick: () => nav("#/tag/1") }, "Tag 1 starten"))
      : h("div.card.hero",
          h("div.small.muted", day.endspurt ? `Endspurt · noch ${daysUntilExam()} Tage bis zur Prüfung` : `Lernpfad · Phase ${day.woche} · Tag ${day.tag} von ${days.length}`),
          h("h2", day.titel),
          h("ul.mini-steps", day.schritte.map((st) => h("li", stepLabel(st)))),
          h("button.btn.primary.wide", { onclick: () => nav(day.endspurt ? "#/endspurt" : "#/tag/" + day.tag) }, dayDone(day.tag) ? (day.endspurt ? "Noch eine Runde" : "Wiederholen") : "▶︎ Tagessession starten"),
          h("p.small.muted.center", "Aufwärmen → Hauptteil → Fehlerwiederholung · ca. 60–90 Min.")),
    h("div.grid2",
      h("button.tile", { onclick: () => nav("#/fehler/wiederholen") }, h("div.tile-ico", "🛠️"), h("div", "Fehler"), h("div.small.muted", `${due} fällig`)),
      h("button.tile", { onclick: () => nav("#/wortschatz/runde") }, h("div.tile-ico", "📚"), h("div", "Wortschatz"), h("div.small.muted", `${srsStats("wort").due} fällig`)),
      h("button.tile", { onclick: () => nav("#/drill") }, h("div.tile-ico", "📐"), h("div", "Grammatik"), h("div.small.muted", "Drills")),
      h("button.tile", { onclick: () => nav("#/bonus") }, h("div.tile-ico", "❄️"), h("div", "Bonusrunde"), h("div.small.muted", `${s.freezes}/${MAX_FREEZES} Freezes`))),
    forecastCard(fc, true),
    h("p.small.muted.center", `${totalXp()} XP gesamt · ${weekXp()} / ${store.settings.weeklyGoalXp} XP diese Woche`));
}

function forecastCard(fc, compact) {
  const rows = Object.entries(fc.parts).map(([g, p]) => {
    const pct = p.acc == null ? null : Math.round(p.acc * 100);
    return h("div.fc-row",
      h("span.fc-name", p.icon + " " + p.name),
      h("div.bar.fc" + (pct == null ? "" : pct >= 60 ? ".good" : ".bad"), { title: pct == null ? "noch keine Daten" : `${pct} % (${p.n} Übungen)` }, h("span", { style: { width: (pct ?? 0) + "%" } }), h("i.mark60")),
      h("span.fc-val", pct == null ? "–" : `${pct} %${p.sicher ? "" : "*"}`));
  });
  const verdict = fc.written == null
    ? "Noch nicht alle Bereiche geübt – Prognose folgt."
    : `Schriftlich ≈ ${fc.written} / 166 ${fc.writtenOk ? "✅" : `❌ (nötig ${PASS.written})`}` + (fc.oral != null ? ` · Mündlich ≈ ${fc.oral} / 48 ${fc.oralOk ? "✅" : `❌ (nötig ${PASS.oral})`}` : "");
  return h("div.card",
    h("div.row.between", h("strong", "Prognose"), h("span.small.muted", "Strich = 60 %-Grenze")),
    rows,
    h("p.small", verdict),
    h("p.small.muted", "* weniger als 4 Übungen – noch unsicher. Die Prognose ist ehrlich: Sie rechnet nur mit deinen letzten Ergebnissen."),
    compact ? h("button.btn.small.ghost", { onclick: () => nav("#/statistik") }, "Statistik →") : null);
}

// ---------- Lernpfad ----------
async function viewPfad() {
  const days = await lernpfad();
  const upTo = unlockedUpTo(days);
  const nextTag = days.find((d) => !dayDone(d.tag))?.tag;
  clear(main).append(topbar(), h("h1", "Lernpfad"), tarsiSays("Ein Tag nach dem anderen – ich laufe den Weg mit dir! Erledigte Tage kannst du jederzeit wiederholen.", "happy", 70));
  const WOCHEN = ["", ["Phase 1 · Tag 1–7", "Format, Strategien & erste Texte", "wave"], ["Phase 2 · Tag 8–14", "Vertiefung, Prüfungstempo & viel Schreiben", "think"], ["Phase 3 · Tag 15–20", "Schwachstellen & Generalproben", "proud"], ["Endspurt", "bis zur Prüfung", "cheer"]];
  const X = [0, 46, 70, 46, 0, -46, -70, -46];
  let w = 0, path = null, i = 0;
  for (const d of days) {
    if (d.woche !== w) {
      w = d.woche;
      const [t, sub, mood] = WOCHEN[w];
      main.append(h("div.week-banner", mascot(mood, 52), h("div", h("h2", t), h("div.small.muted", sub))));
      path = h("div.path");
      main.append(path);
      i = 0;
    }
    const locked = d.tag > upTo;
    const done = dayDone(d.tag);
    const dt = new Date(d.datum + "T12:00");
    const cls = (done ? ".done" : "") + (locked ? ".locked" : "") + (d.tag === nextTag ? ".next" : "");
    path.append(h("button.day" + cls, { disabled: locked, style: { "--x": X[i++ % X.length] + "px" }, onclick: () => nav("#/tag/" + d.tag) },
      h("span.day-num", done ? "✓" : locked ? "🔒" : d.tag === nextTag ? "★" : d.tag),
      h("span.day-txt", h("strong", d.titel), h("span.small.muted", "Tag " + d.tag + " · " + dt.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })))));
  }
  main.append(h("div.week-banner", mascot("cheer", 52), h("div", h("h2", "Endspurt"), h("div.small.muted", "Nach Tag 20 bis zur Prüfung: jeden Tag eine Session mit deinen Schwachstellen und Schreiben; Samstag Generalprobe 3; die letzten 2 Tage leicht."))));
  main.append(h("div.card.center", mascot("proud", 90), h("p", h("strong", "🎓 Samstag, 12.12.2026 – Prüfungstag")), h("button.btn.small", { onclick: () => nav("#/strategie/checkliste") }, "Checkliste")));
}

// ---------- Üben ----------
async function viewUeben() {
  clear(main).append(topbar(), h("h1", "Üben"), h("p.muted", "Alles frei wählbar – zusätzlich zum Lernpfad."));
  const sec = (title, items) => main.append(h("h2", title), h("div.grid2", items.map(([ico, name, sub, href]) => h("button.tile", { onclick: () => nav(href) }, h("div.tile-ico", ico), h("div", name), h("div.small.muted", sub)))));
  sec("Aufgaben verstehen", [["🧐", "Aufgabenstellungen", "Was muss ich tun?", "#/aufgaben"]]);
  sec("Sprache", [["🧩", "Sprachbausteine", "22 Lücken", "#/sb"], ["📐", "Grammatik", "Drills & Erklärungen", "#/drill"], ["📚", "Wortschatz", "Spaced Repetition", "#/wortschatz"], ["💬", "Redewendungen", "Idiome & Redemittel", "#/redewendungen"]]);
  sec("Prüfungsteile", [["📖", "Lesen", "Teil 1–3", "#/lesen"], ["🎧", "Hören", "Teil 1–3", "#/hoeren"], ["✍️", "Schreiben", "Erörterung", "#/schreiben"], ["🎤", "Sprechen", "Präsentation & Diskussion", "#/sprechen"]]);
  sec("Prüfung", [["🎓", "Generalproben", "3 komplette Tests", "#/pruefung"], ["💡", "Strategie", "Karten je Teil", "#/strategie"], ["🔗", "Echte Audios", "Linkliste", "#/quellen"], ["🧭", "Einstufung", "erneut machen", "#/einstufung"]]);
}

function itemList(list, render, onPick) {
  const wrap = h("div.list");
  for (const it of list) {
    const done = store.attempts.filter((a) => a.itemId === it.id && a.max > 0);
    const best = done.length ? Math.max(...done.map((a) => Math.round((a.score / a.max) * 100))) : null;
    wrap.append(h("button.list-item", { onclick: () => onPick(it) }, h("div", render(it)), h("span.chip.soft", best == null ? (it.niveau || "neu") : `${best} %`)));
  }
  return wrap;
}

async function chooseMode() {
  return new Promise((resolve) => {
    const wrap = h("div.modal-wrap", h("div.modal", h("h2", "Modus wählen"),
      h("button.option", { onclick: () => { wrap.remove(); resolve("uebung"); } }, h("strong", "Übungsmodus"), h("div.small.muted", "ohne Zeitdruck, Tipps, beim Hören: Pause & Tempo")),
      h("button.option", { onclick: () => { wrap.remove(); resolve("pruefung"); } }, h("strong", "Prüfungsmodus ⏱"), h("div.small.muted", "Originalzeiten, Hörtext nur einmal")),
      h("button.btn.ghost.wide", { onclick: () => { wrap.remove(); resolve(null); } }, "Abbrechen")));
    document.body.append(wrap);
  });
}

async function viewList(kind) {
  clear(main).append(topbar());
  if (kind === "sb") {
    const all = pool(await load("sb"));
    main.append(h("h1", "Sprachbausteine"), h("p.muted", "Text mit 22 Lücken, je 4 Optionen – wie in der Prüfung (25 Min.)."),
      h("button.btn.wide", { onclick: () => nav("#/strategie/sb") }, "💡 Strategie"),
      itemList(all, (s) => [h("strong", s.titel), h("div.small.muted", (THEMEN[s.thema] || "") + " · " + (s.textsorte || ""))], async (s) => { const m = await chooseMode(); if (m) exercise(() => sbExam(main, s, { mode: m, minutes: 25 })); }));
  } else if (kind === "lesen" || kind === "hoeren") {
    const all = pool(await load(kind));
    const teile = kind === "lesen" ? ["lv1", "lv2", "lv3"] : ["hv1", "hv2", "hv3"];
    main.append(h("h1", kind === "lesen" ? "Leseverstehen" : "Hörverstehen"));
    if (kind === "hoeren") main.append(h("p.small.muted", ttsSupported() ? "Die Texte werden mit deutschen Systemstimmen vorgelesen. Bessere Stimmen: iPhone-Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch (z. B. „Anna (Erweitert)“)." : "⚠️ Dieser Browser kann nicht vorlesen."));
    for (const t of teile) {
      main.append(h("h2", TEILE[t].name), itemList(all.filter((x) => x.teil === t), (x) => [h("strong", x.titel), h("div.small.muted", THEMEN[x.thema] || "")], async (x) => {
        const m = await chooseMode();
        if (m) exercise(() => (kind === "lesen" ? lesenExam(main, x, { mode: m }) : hoerenExam(main, x, { mode: m })));
      }));
    }
  } else if (kind === "schreiben") {
    const all = pool(await load("schreiben"));
    const texts = [...store.texts.values()].filter((t) => t.typ === "schreiben").sort((a, b) => b.t - a.t);
    main.append(h("h1", "Schriftlicher Ausdruck"), h("p.muted", "Erörterung oder Stellungnahme zu zwei gegensätzlichen Zitaten, mind. 350 Wörter, 70 Minuten. (Eine Grafikbeschreibung gibt es in dieser Prüfung nicht.)"),
      h("button.btn.wide", { onclick: () => nav("#/strategie/schreiben") }, "💡 Strategie"),
      h("h2", "✏️ Kurz-Schreiben (10–15 Min.)"),
      h("p.small.muted", "Trainiere einzelne Bausteine – mit KI-Feedback und verbesserter Version."),
      h("div.chips", Object.entries(MINI_TYPEN).map(([k, v]) => h("button.chip", { onclick: async () => { const it = await pickMini(k); if (it) exercise(() => miniSchreiben(main, it)); else toast("Kurz-Übungen werden noch erstellt."); } }, v))),
      h("h2", "Ganze Aufgaben (70 Min.)"),
      itemList(all, (t) => [h("strong", t.zitate?.[0]?.text?.slice(0, 70) + "…"), h("div.small.muted", (THEMEN[t.thema] || "") + " · " + t.textsorte)], async (t) => {
        const m = await chooseMode();
        if (!m) return;
        const tasks = m === "pruefung" ? all.filter((x) => x.paar === t.paar) : [t];
        exercise(() => schreibenTask(main, tasks, { mode: m, minutes: 70 }));
      }));
    if (texts.length) {
      main.append(h("h2", "Meine Texte"));
      for (const t of texts) main.append(h("button.list-item", { onclick: async () => {
        const task = (await load("schreiben")).find((x) => x.id === t.aufgabeId);
        if (t.feedback?.quelle === "ki") exercise(() => showFeedback(main, task, t, t.feedback, 0));
        else toast("Für diesen Text gibt es nur eine Selbsteinschätzung.");
      } }, h("div", h("strong", new Date(t.t).toLocaleDateString("de-DE")), h("div.small.muted", `${t.woerter} Wörter`)), h("span.chip.soft", t.feedback ? `${t.feedback.punkte}/48` : "–")));
    }
  } else if (kind === "sprechen") {
    const sp = await load("sprechen");
    main.append(h("h1", "Mündlicher Ausdruck"), h("p.muted", "Sprich per Diktat (🎤 in der iPhone-Tastatur). Die KI-Partnerin fragt nach und diskutiert mit dir."),
      h("div.row", h("button.btn", { onclick: () => nav("#/strategie/sprechen_1a") }, "💡 Präsentation"), h("button.btn", { onclick: () => nav("#/strategie/sprechen_2") }, "💡 Diskussion")),
      h("h2", "Teil 1A/1B – Präsentation"),
      itemList(pool(sp.praesentation), (b) => [h("strong", b.themen.map((t) => t.titel).join(" / "))], (b) => exercise(() => praesentation(main, b))),
      h("h2", "Teil 2 – Diskussion"),
      itemList(pool(sp.diskussion), (d) => [h("strong", "„" + d.zitat.slice(0, 80) + (d.zitat.length > 80 ? "…" : "") + "“")], (d) => exercise(() => diskussion(main, d))));
  }
}

async function viewAufgaben() {
  clear(main).append(topbar(), h("h1", "Aufgaben verstehen"),
    strategyCard(false),
    h("button.btn.primary.wide", { onclick: () => exercise(() => aufgabenRound(main, { n: 3 }), "#/aufgaben") }, "▶︎ Üben: 3 Aufgabenstellungen"),
    h("div.grid2",
      h("button.tile", { onclick: () => exercise(() => eigeneWorte(main), "#/aufgaben") }, h("div.tile-ico", "🗣️"), h("div", "Mit eigenen Worten"), h("div.small.muted", "Sag, was du tun musst")),
      h("button.tile", { onclick: () => exercise(() => glossarRound(main, { n: 10, gruppe: "operator" }), "#/aufgaben") }, h("div.tile-ico", "🎯"), h("div", "Arbeitsaufträge"), h("div.small.muted", "erörtern ≠ erläutern …")),
      h("button.tile", { onclick: () => exercise(() => glossarRound(main, { n: 10, gruppe: "autor" }), "#/aufgaben") }, h("div.tile-ico", "✍️"), h("div", "Was der Autor tut"), h("div.small.muted", "relativiert, räumt ein …")),
      h("button.tile", { onclick: () => exercise(() => glossarRound(main, { n: 10 }), "#/aufgaben") }, h("div.tile-ico", "📖"), h("div", "Alle Aufgabenwörter"), h("div.small.muted", "gemischt"))),
    h("h2", "Nach Prüfungsteil üben"),
    h("p.small.muted", "Jede Runde beginnt mit dem Steckbrief des Teils: So sieht die Anweisung aus, darauf kommt es an."),
    h("div.chips", Object.entries(TEIL_NAMEN).map(([t, name]) => h("button.chip", { onclick: () => exercise(() => aufgabenRound(main, { n: 3, teil: t }), "#/aufgaben") }, name))),
    h("h2", "Steckbriefe: alle Prüfungsteile kurz erklärt"));
  const sb = h("div");
  main.append(sb);
  steckbriefe(sb);
  main.append(h("p.small.muted", "Tipp: In jeder Übung gibt es oben den Knopf „❓ Was muss ich tun?“."), h("h2", "Nachschlagen: Wörter in Aufgabenstellungen"));
  const box = h("div");
  main.append(box);
  glossarList(box);
}

async function viewDrills() {
  const gr = await load("grammatik");
  const drills = await load("drills");
  clear(main).append(topbar(), h("h1", "Grammatik"), h("p.muted", "Kurze Erklärung, dann 10 Aufgaben. Deine Fehlerkategorien stehen oben."),
    h("button.btn.primary.wide", { onclick: () => exercise(() => drillRound(main, null, 12)) }, "🔀 Gemischte Runde"));
  const errs = new Map(errorCategories().map((c) => [c.kategorie, c.offen]));
  const kats = [...new Set(drills.map((d) => d.kategorie))].sort((a, b) => (errs.get(b) || 0) - (errs.get(a) || 0));
  main.append(h("div.list", kats.map((k) => h("button.list-item", { onclick: () => nav("#/drill/" + k) }, h("div", h("strong", KATEGORIEN[k] || k), h("div.small.muted", `${drills.filter((d) => d.kategorie === k).length} Aufgaben`)), errs.get(k) ? h("span.chip.bad", `${errs.get(k)} Fehler`) : null))));
}

async function viewDrill(kat) {
  clear(main).append(h("div.ex-head", h("button.icon-btn", { onclick: () => nav("#/drill") }, "←"), h("strong", KATEGORIEN[kat] || kat), h("span")), await grammarCard(kat),
    h("button.btn.primary.wide", { onclick: () => exercise(() => drillRound(main, kat, 10), "#/drill") }, "10 Aufgaben üben"));
}

async function viewVocab(kind) {
  const st = srsStats(kind === "wortschatz" ? "wort" : "rw");
  const all = await load(kind);
  clear(main).append(topbar(), h("h1", kind === "wortschatz" ? "Akademischer Wortschatz" : "Redewendungen & Redemittel"),
    h("div.stat-row", h("div.stat", h("b", st.learned), h("span", "gelernt")), h("div.stat", h("b", st.seen - st.learned), h("span", "im Training")), h("div.stat", h("b", all.length - st.seen), h("span", "neu"))),
    h("button.btn.primary.wide", { onclick: () => nav(`#/${kind}/runde`) }, `▶︎ Runde starten (${st.due} fällig)`));
  if (kind === "wortschatz") {
    main.append(h("h2", "Nach Thema"), h("div.chips", Object.entries(THEMEN).filter(([k]) => all.some((w) => w.thema === k)).map(([k, v]) => h("button.chip", { onclick: () => exercise(() => srsRound(main, "wort", { filter: (w) => w.thema === k, title: v }), "#/wortschatz") }, v))));
    main.append(h("button.btn.wide", { onclick: () => exercise(() => matchRound(main, "wort"), "#/wortschatz") }, "🔗 Zuordnen"));
    main.append(h("button.btn.wide", { onclick: async () => { const learned = all.filter((w) => store.card(w.id)?.seen); const w = learned.length ? learned[Math.floor(Math.random() * learned.length)] : all[0]; exercise(() => satzWerkstatt(main, "wort", w), "#/wortschatz"); } }, "✍️ Eigenen Satz bilden"));
  } else {
    main.append(h("h2", "Nach Art"), h("div.chips",
      [["idiom", "Idiome"], ["feste_wendung", "Feste Wendungen"], ["redemittel", "Redemittel"]].map(([k, v]) => h("button.chip", { onclick: () => exercise(() => srsRound(main, "rw", { filter: (r) => r.typ === k, title: v }), "#/redewendungen") }, v)),
      [["schreiben", "✍️ für Schreiben"], ["sprechen", "🎤 für Sprechen"]].map(([k, v]) => h("button.chip", { onclick: () => exercise(() => srsRound(main, "rw", { filter: (r) => r.pruefung === k || r.pruefung === "beides", title: v }), "#/redewendungen") }, v))));
    main.append(h("button.btn.wide", { onclick: () => exercise(() => matchRound(main, "rw"), "#/redewendungen") }, "🔗 Zuordnen"));
    main.append(h("button.btn.wide", { onclick: async () => { const r = all[Math.floor(Math.random() * all.length)]; exercise(() => satzWerkstatt(main, "rw", { ...r, erklaerung: r.bedeutung }), "#/redewendungen"); } }, "✍️ Eigenen Satz bilden"));
  }
  main.append(h("h2", "Nachschlagen"));
  const listEl = h("div");
  main.append(listEl);
  browseList(listEl, kind === "wortschatz" ? "wort" : "rw");
}

// ---------- Statistik ----------
function barsSvg(values, labels, { height = 120, unit = "" } = {}) {
  const max = Math.max(1, ...values);
  const w = 100 / values.length;
  const svg = `<svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" class="chart" role="img" aria-label="Balkendiagramm">` +
    values.map((v, i) => {
      const bh = (v / max) * (height - 4);
      return `<rect x="${i * w + w * 0.18}" y="${height - bh}" width="${w * 0.64}" height="${Math.max(0, bh)}" rx="1.2"><title>${labels[i]}: ${v}${unit}</title></rect>`;
    }).join("") + `</svg>`;
  return h("div.chart-wrap", { html: svg }, h("div.chart-x", labels.map((l, i) => (i % 2 === 0 ? h("span", l) : h("span", "")))));
}

function sparkline(trend) {
  if (trend.length < 2) return h("span.small.muted", "–");
  const pts = trend.map((p, i) => `${(i / (trend.length - 1)) * 100},${30 - p.p * 28}`).join(" ");
  return h("div.spark", { html: `<svg viewBox="0 0 100 31" preserveAspectRatio="none" class="chart"><line x1="0" x2="100" y1="${30 - 0.6 * 28}" y2="${30 - 0.6 * 28}" class="ref"/><polyline points="${pts}" class="line"/></svg>` });
}

function viewStats() {
  const fc = forecast();
  const s = streakInfo();
  const lv = levelInfo();
  const byDay = xpByDay();
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
  const minutes = days.map((d) => studyMinutes(d));
  const cats = errorCategories().slice(0, 8);
  const earned = new Set(earnedBadges());
  clear(main).append(topbar(), h("h1", "Statistik"),
    h("div.stat-row",
      h("div.stat", h("b", s.streak), h("span", "Tage Streak")), h("div.stat", h("b", s.best), h("span", "Rekord")),
      h("div.stat", h("b", studyMinutes()), h("span", "Min. gesamt")), h("div.stat", h("b", totalXp()), h("span", "XP"))),
    h("div.card", h("div.row.between", h("strong", `Level ${lv.level}`), h("span.small.muted", `${lv.into} / ${lv.need} XP bis Level ${lv.level + 1}`)), progressBar(lv.into, lv.need)),
    forecastCard(fc, false),
    h("div.card", h("strong", "Genauigkeit im Verlauf (letzte 20 Übungen je Bereich)"),
      Object.entries(GROUPS).map(([g, info]) => { const a = groupAccuracy(g); return h("div.trend-row", h("span", info.icon + " " + info.name), sparkline(a.trend), h("span.small", a.acc == null ? "–" : Math.round(a.acc * 100) + " %")); }),
      h("p.small.muted", "Gestrichelte Linie = 60 %.")),
    h("div.card", h("strong", "Lernzeit (Minuten, letzte 14 Tage)"), barsSvg(minutes, days.map((d) => d.slice(8) + "."), { unit: " Min." }), h("p.small.muted", `Heute: ${studyMinutes(dayKey())} Min. · Woche: ${weekXp()} XP`)),
    h("div.card", h("strong", "Gelernt"),
      h("div.stat-row", h("div.stat", h("b", srsStats("wort").learned), h("span", "Wörter")), h("div.stat", h("b", srsStats("rw").learned), h("span", "Redewendungen")),
        h("div.stat", h("b", store.attempts.filter((a) => a.modul === "sb").length), h("span", "SB-Sets")), h("div.stat", h("b", [...store.texts.values()].filter((t) => t.typ === "schreiben").length), h("span", "Texte")))),
    h("div.card", h("strong", "Häufigste Fehlerarten"), cats.length ? h("table.tbl", h("tr", h("th", "Fehlerart"), h("th", "gesamt"), h("th", "offen")), cats.map((c) => h("tr", h("td", KATEGORIEN[c.kategorie] || c.kategorie), h("td", c.gesamt), h("td", c.offen)))) : h("p.small.muted", "Noch keine Fehler gesammelt.")),
    h("h2", "Abzeichen"),
    h("div.badges", BADGES.map((b) => h("div.badge" + (earned.has(b.id) ? ".on" : ""), { title: b.desc }, h("div.badge-ico", b.icon), h("div.small", b.name)))));
}

// ---------- Prüfung / Strategie / Quellen ----------
async function viewPruefung() {
  clear(main).append(topbar(), h("h1", "Generalproben"), h("p.muted", "Drei komplette Probeprüfungen mit Originalablauf und -zeiten. Die Aufgaben kommen im normalen Üben nicht vor. Plane für eine komplette Probe ca. 4,5 Stunden ein (du kannst zwischen den Teilen pausieren)."));
  for (const nr of [1, 2, 3]) {
    const st = await db.kvGet("mock." + nr);
    const doneA = store.attempts.find((a) => a.modul === "pruefung" && a.itemId === "mock" + nr);
    main.append(h("div.card", h("div.row.between", h("strong", `Generalprobe ${nr}`), doneA ? h("span.chip", `${doneA.score} / ${doneA.max}`) : st ? h("span.chip.soft", "begonnen") : null),
      h("div.row", h("button.btn.primary", { onclick: () => exercise(() => generalprobe(main, nr), "#/pruefung") }, st ? "Fortsetzen" : "Komplett"),
        h("button.btn", { onclick: () => exercise(() => generalprobe(main, nr, "schriftlich"), "#/pruefung") }, "Nur schriftlich"),
        h("button.btn", { onclick: () => exercise(() => generalprobe(main, nr, "muendlich"), "#/pruefung") }, "Nur mündlich"))));
  }
}

async function viewStrategie() {
  const st = await load("strategie");
  clear(main).append(topbar(), h("h1", "Strategie & Prüfungstag"),
    h("button.list-item", { onclick: () => nav("#/strategie/ueberblick") }, h("strong", "📋 Die Prüfung im Überblick")),
    h("button.list-item", { onclick: () => nav("#/strategie/checkliste") }, h("strong", "✅ Checkliste für den 12.12.")),
    (st.karten || []).map((k) => h("button.list-item", { onclick: () => nav("#/strategie/" + k.teil) }, h("div", h("strong", "💡 " + k.titel), k.zeit ? h("div.small.muted", "⏱ " + k.zeit) : null))));
}

async function viewCheckliste() {
  const st = await load("strategie");
  const saved = (await db.kvGet("checkliste", {})) || {};
  clear(main).append(h("div.ex-head", h("button.icon-btn", { onclick: () => nav("#/strategie") }, "←"), h("strong", "Prüfungstag 12.12."), h("span")));
  for (const g of st.pruefungstag || []) {
    main.append(h("div.card", h("strong", g.gruppe), h("div.checks", g.punkte.map((p) => {
      const id = g.gruppe + "|" + p;
      return h("label.check", h("input", { type: "checkbox", checked: !!saved[id], onchange: (e) => { saved[id] = e.target.checked; db.kvSet("checkliste", saved); } }), h("span", p));
    }))));
  }
  if (!(st.pruefungstag || []).length) main.append(h("p.muted", "Checkliste wird noch erstellt."));
}

async function viewQuellen() {
  const links = await load("links");
  clear(main).append(topbar(), h("h1", "Echte Hörtexte"), h("p.muted", "Frei zugängliche Audios und Videos (nur verlinkt). Ideal als Zusatztraining – z. B. Notizen machen und dann in 5 Sätzen zusammenfassen."));
  const by = {};
  for (const l of links) (by[l.quelle] = by[l.quelle] || []).push(l);
  for (const [q, ls] of Object.entries(by)) {
    main.append(h("h2", q), ls.map((l) => h("div.card.link-card",
      h("a", { href: l.url, target: "_blank", rel: "noopener" }, l.titel + " ↗"),
      h("div.small.muted", [l.typ, l.dauer, l.thema].filter(Boolean).join(" · ")),
      h("p.small", l.beschreibung), l.tipp ? h("p.small", "🎯 " + l.tipp) : null)));
  }
  if (!links.length) main.append(h("p.muted", "Linkliste wird noch erstellt."));
}

// ---------- Mehr / Einstellungen ----------
async function viewMehr() {
  const s = store.settings;
  await voicesReady();
  const voices = germanVoices();
  const spent = await ai.spentToday();
  const total = await ai.spentTotal();
  const connected = await dropbox.isConnected();
  const keyInput = h("input", { type: "password", placeholder: ai.hasKey() ? "•••••••• (gespeichert)" : "sk-ant-…", autocomplete: "off" });
  const voiceSel = (field, label) => h("label.field", h("span", label), h("select", { onchange: (e) => store.saveSettings({ [field]: e.target.value }) },
    h("option", { value: "" }, "automatisch"), voices.map((v) => h("option", { value: v.voiceURI, selected: s[field] === v.voiceURI }, `${v.name} (${v.lang})`))));
  const num = (field, label, step = 1, min = 0) => h("label.field", h("span", label), h("input", { type: "number", value: s[field], step, min, onchange: (e) => store.saveSettings({ [field]: +e.target.value }) }));

  clear(main).append(topbar(), h("h1", "Mehr"),
    h("div.list",
      h("button.list-item", { onclick: () => nav("#/strategie") }, h("strong", "💡 Strategie & Prüfungstag")),
      h("button.list-item", { onclick: () => nav("#/quellen") }, h("strong", "🔗 Echte Hörtexte (Links)")),
      h("button.list-item", { onclick: () => nav("#/pruefung") }, h("strong", "🎓 Generalproben"))),

    h("h2", "Profil"),
    h("div.card",
      h("label.field", h("span", "Dein Vorname (für die Begrüßung)"), h("input", { type: "text", value: s.name, placeholder: "z. B. Anna", onchange: (e) => store.saveSettings({ name: e.target.value.trim() }) })),
      h("label.field", h("span", "Über mich (hilft der KI beim Feedback)"), h("textarea.answer", { rows: 3, placeholder: "z. B. Biologielehrerin aus …, möchte meinen Abschluss in NRW anerkennen lassen", onchange: (e) => store.saveSettings({ profil: e.target.value.trim() }) }, s.profil || ""))),

    h("h2", "Ziele"),
    h("div.card", num("dailyGoalXp", "Tagesziel (XP)", 10, 10), num("weeklyGoalXp", "Wochenziel (XP)", 50, 50), num("newWordsPerDay", "Neue Wörter pro Tag", 1, 0), num("newIdiomsPerDay", "Neue Redewendungen pro Tag", 1, 0)),

    h("h2", "KI-Feedback (Claude)"),
    h("div.card",
      h("p.small", ai.hasKey() ? "✅ API-Key ist auf diesem Gerät gespeichert." : "Ohne Key funktioniert alles – du bekommst dann Musterlösungen und Checklisten statt KI-Feedback."),
      h("label.field", h("span", "API-Key"), keyInput),
      h("div.row",
        h("button.btn.primary", { onclick: async () => { if (!keyInput.value.trim()) return; await ai.setKey(keyInput.value); toast("Gespeichert"); viewMehr(); } }, "Speichern"),
        ai.hasKey() ? h("button.btn", { onclick: async () => { await ai.setKey(""); toast("Key gelöscht"); viewMehr(); } }, "Löschen") : null,
        ai.hasKey() ? h("button.btn", { onclick: async () => { try { await ai.call({ system: "Antworte kurz auf Deutsch.", messages: [{ role: "user", content: "Sag 'Verbindung steht'." }], maxTokens: 1000, effort: "low" }); toast("✓ Verbindung steht"); viewMehr(); } catch (e) { toast(e.message); } } }, "Testen") : null),
      h("label.field", h("span", "Modell"), h("select", { onchange: (e) => store.saveSettings({ aiModel: e.target.value }) }, Object.entries(MODELS).map(([id, m]) => h("option", { value: id, selected: s.aiModel === id }, m.name)))),
      num("aiDailyLimitUsd", "Tageslimit (US-$)", 0.5, 0),
      h("p.small", `Heute verbraucht: ${spent.toFixed(3)} $ von ${s.aiDailyLimitUsd.toFixed(2)} $ · insgesamt: ${total.toFixed(2)} $`),
      h("p.small.muted", "Richtwerte mit Sonnet 5.5: Textbewertung ≈ 0,03–0,06 $, Diskussion ≈ 0,03–0,05 $, Satzprüfung < 0,01 $ (Opus etwa doppelt so viel). Der Key bleibt nur auf diesem Gerät und wird nicht synchronisiert.")),

    h("h2", "Vorlesen"),
    h("div.card",
      voices.length ? null : h("p.small.muted", "Keine deutschen Stimmen gefunden."),
      voiceSel("ttsVoiceA", "Stimme A"), voiceSel("ttsVoiceB", "Stimme B"), voiceSel("ttsVoiceC", "Stimme C (Moderation)"),
      h("button.btn", { onclick: () => { speakOnce("Guten Tag, ich bin Stimme A.", "A"); setTimeout(() => speakOnce("Und ich bin Stimme B.", "B"), 2500); } }, "🔊 Probehören"),
      h("p.small.muted", "Tipp: Unter iPhone-Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch erweiterte Stimmen laden (z. B. Anna, Helena, Martin).")),

    h("h2", "Sicherung & Sync"),
    h("div.card",
      dropbox.isConfigured()
        ? connected
          ? h("div", h("p.small", "✅ Mit Dropbox verbunden." + (sync.lastSync ? " Letzter Abgleich: " + new Date(sync.lastSync).toLocaleString("de-DE") : "")), sync.lastError ? h("p.small.bad", "Fehler: " + sync.lastError) : null,
              h("div.row", h("button.btn.primary", { onclick: async () => { const r = await sync.run(); toast(r.error ? "Fehler: " + r.error : "✓ Abgeglichen"); viewMehr(); } }, "Jetzt abgleichen"), h("button.btn", { onclick: async () => { await dropbox.disconnect(); viewMehr(); } }, "Trennen")))
          : h("div", h("p.small", "Lernstand, Fehlerprotokoll und Texte als JSON in deiner Dropbox sichern."),
              h("div.row", h("button.btn.primary", { onclick: () => dropbox.startAuth().catch((e) => toast(e.message)) }, "Mit Dropbox verbinden"),
                h("button.btn", { onclick: () => dropboxCodeFlow() }, "Per Code (Home-Bildschirm-App)")))
        : h("p.small.muted", "Dropbox ist noch nicht eingerichtet (App-Key fehlt, siehe README)."),
      h("div.row",
        h("button.btn", { onclick: () => sync.exportToFile() }, "⬇︎ Export (Datei)"),
        h("label.btn", "⬆︎ Import", h("input.hidden", { type: "file", accept: "application/json", onchange: async (e) => { try { await sync.importFromFile(e.target.files[0]); toast("✓ Importiert"); } catch (err) { toast(err.message); } } })))),

    h("h2", "Sonstiges"),
    h("div.card",
      h("p.small.muted", `Version ${CONFIG.APP_VERSION} · Prüfung am ${new Date(CONFIG.EXAM_DATE).toLocaleDateString("de-DE")}`),
      h("button.btn.bad", { onclick: async () => { if (await confirmBox("Alles zurücksetzen?", "Lernstand, Fehler und Texte auf diesem Gerät werden gelöscht. (Dropbox-Sicherung bleibt.)", "Löschen")) { await store.resetAll(); toast("Zurückgesetzt"); nav("#/"); } } }, "Lernstand zurücksetzen")));
}

// Dropbox-Anmeldung per Code (für die Home-Bildschirm-App: Redirect würde in Safari landen)
async function dropboxCodeFlow(fresh = false) {
  // Offene Anmeldung (max. 2 Std. alt) wiederverwenden – so passt der Code auch, wenn die Zulassung
  // auf einem anderen Gerät erfolgt und man zwischendurch die App gewechselt hat.
  let pending = fresh ? null : await db.kvGet("dbx.pendingUrl");
  const pkce = await db.kvGet("dbx.pkce");
  if (!pending || !pkce || Date.now() - pending.t > 2 * 3600e3) {
    try { pending = { url: await dropbox.startAuth({ manual: true }), t: Date.now() }; } catch (e) { return toast(e.message); }
    await db.kvSet("dbx.pendingUrl", pending);
  }
  const url = pending.url;
  const inp = h("input", { type: "text", placeholder: "Code hier einfügen", autocomplete: "off", autocapitalize: "off", spellcheck: false });
  const share = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: "Dropbox-Freigabe für die C1-App", url });
    } catch (e) { if (e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); toast("Link kopiert"); } catch (_) { toast("Kopieren nicht möglich"); }
  };
  const body = h("div",
    h("p.small", h("strong", "Auf diesem Gerät bei Dropbox angemeldet?")),
    h("a.btn.wide", { href: url, target: "_blank", rel: "noopener" }, "Dropbox öffnen ↗"),
    h("p.small", h("strong", "Dropbox-Konto gehört jemand anderem?"), " Link teilen (z. B. per AirDrop oder Nachricht). Die andere Person öffnet ihn auf ihrem Gerät, tippt „Zulassen“ und schickt dir den Code zurück."),
    h("button.btn.wide", { onclick: share }, "🔗 Link teilen"),
    h("p.small.muted", "Den Code dann hier einfügen und „Verbinden“ tippen. Der Link bleibt 2 Stunden gültig, auch wenn du diesen Dialog schließt."),
    inp,
    h("button.btn.ghost.small", { onclick: () => { document.querySelector(".modal-wrap")?.remove(); dropboxCodeFlow(true); } }, "Neuen Link erzeugen"));
  const res = await modal("Mit Dropbox verbinden", body, [{ label: "Abbrechen", value: false }, { label: "Verbinden", value: true, primary: true }]);
  const code = inp.value.trim();
  if (!res || !code) return;
  try {
    await dropbox.finishManualCode(code);
    await db.kvDel("dbx.pendingUrl");
    toast("✓ Mit Dropbox verbunden");
    await sync.run();
  } catch (e) { toast(e.message); }
  viewMehr();
}

// ---------- Übung ausführen ----------
async function exercise(fn, back) {
  const startHash = location.hash;
  busy = true;
  tabbar.classList.add("hidden");
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast("Fehler: " + e.message);
  } finally {
    busy = false;
    tabbar.classList.remove("hidden");
    window.scrollTo(0, 0);
    checkMilestone();
    if (location.hash !== startHash) route();
    else if (back) nav(back);
    else route();
    sync.run();
  }
}

// ---------- Router ----------
const TABS = [["#/", "🏠", "Heute"], ["#/pfad", "🗺️", "Lernpfad"], ["#/ueben", "🏋️", "Üben"], ["#/statistik", "📊", "Statistik"], ["#/mehr", "⚙️", "Mehr"]];
function renderTabs(hash) {
  clear(tabbar).append(...TABS.map(([href, ico, label]) => h("a.tab" + ((href === "#/" ? hash === "#/" || hash === "" : hash.startsWith(href)) ? ".on" : ""), { href }, h("span.tab-ico", ico), h("span.tab-lbl", label))));
}

async function route() {
  if (busy) return;
  const hash = location.hash || "#/";
  const [, a, b, c] = hash.split("/");
  renderTabs(hash);
  window.scrollTo(0, 0);
  try {
    switch (a || "") {
      case "": return viewHome();
      case "pfad": return viewPfad();
      case "tag": { const days = await lernpfad(); const d = days.find((x) => x.tag === +b); if (!d || d.tag > unlockedUpTo(days)) return nav("#/pfad"); return exercise(() => runDay(main, d, nav), "#/"); }
      case "endspurt": return exercise(() => runDay(main, endspurtDay(Math.max(1, daysUntilExam())), nav), "#/");
      case "ueben": return viewUeben();
      case "sb": return viewList("sb");
      case "lesen": return viewList("lesen");
      case "hoeren": return viewList("hoeren");
      case "schreiben": return viewList("schreiben");
      case "sprechen": return viewList("sprechen");
      case "drill": return b ? viewDrill(b) : viewDrills();
      case "aufgaben": return viewAufgaben();
      case "wortschatz": return b === "runde" ? exercise(() => srsRound(main, "wort", { n: 12 }), "#/wortschatz") : viewVocab("wortschatz");
      case "redewendungen": return b === "runde" ? exercise(() => srsRound(main, "rw", { n: 10 }), "#/redewendungen") : viewVocab("redewendungen");
      case "fehler": return b === "wiederholen" ? exercise(() => errorReview(main, { n: 10, kategorie: c }), "#/fehler") : errorOverview(main, nav);
      case "statistik": return viewStats();
      case "pruefung": return viewPruefung();
      case "strategie": return b === "checkliste" ? viewCheckliste() : b ? exercise(() => strategieKarte(main, b, true), "#/strategie") : viewStrategie();
      case "quellen": return viewQuellen();
      case "einstufung": return exercise(() => einstufung(main), "#/");
      case "bonus": return exercise(() => bonusRound(main, () => {}), "#/");
      case "mehr": return viewMehr();
      default: return viewHome();
    }
  } catch (e) {
    console.error(e);
    clear(main).append(emptyBox("Da ist etwas schiefgelaufen: " + e.message));
  }
}

// ---------- Start ----------
async function start() {
  await store.init();
  await ai.init();
  await sync.init();
  try {
    if (await dropbox.handleRedirect()) toast("✓ Mit Dropbox verbunden");
  } catch (e) { toast(e.message); }
  window.addEventListener("hashchange", route);
  store.onChange((what) => { if (!busy && what === "merge") route(); });
  route();
  sync.run();
  // Fehlerprotokoll-Tab-Badge
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw?.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            const bar = h("div.update", "Neue Version verfügbar.", h("button.btn.small", { onclick: () => { nw.postMessage("skipWaiting"); } }, "Neu laden"));
            document.body.append(bar);
          }
        });
      });
    }).catch((e) => console.warn("SW", e));
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  // Sync, wenn die App wieder in den Vordergrund kommt
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !busy) sync.run(); });
}

start();
