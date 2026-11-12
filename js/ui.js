// Kleine DOM-Helfer ohne Framework.

// append/prepend/after akzeptieren in dieser App auch Arrays und ignorieren null/false
// (sonst würde der Browser „null“ bzw. „[object …]“ als Text einfügen).
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ["append", "prepend", "after", "before"]) {
    const orig = proto[m];
    if (!orig || orig.__c1) continue;
    const wrapped = function (...nodes) {
      return orig.apply(this, nodes.flat(Infinity).filter((x) => x != null && x !== false));
    };
    wrapped.__c1 = true;
    proto[m] = wrapped;
  }
}

/** h("div.card#x", {onclick}, kinder…) */
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) kids.unshift(attrs);
    attrs = {};
  }
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || "div");
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className += " " + v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && k !== "list" && k !== "type") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** **fett** und _kursiv_ in sicheres HTML umwandeln (für Erklärtexte). */
export function md(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}

let toastTimer = null;
export function toast(msg, kind = "") {
  let t = document.getElementById("toast");
  if (!t) {
    t = h("div#toast");
    document.body.append(t);
  }
  t.className = "show " + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}

export function modal(title, body, actions = [{ label: "OK" }]) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); resolve(v); };
    const wrap = h("div.modal-wrap", { onclick: (e) => { if (e.target === wrap) close(null); } },
      h("div.modal", h("h2", title), typeof body === "string" ? h("p", { html: md(body) }) : body,
        h("div.row.end", actions.map((a) => h("button.btn" + (a.primary ? ".primary" : ""), { onclick: () => close(a.value ?? a.label) }, a.label)))));
    document.body.append(wrap);
  });
}

export function confirmBox(title, text, yes = "Ja", no = "Abbrechen") {
  return modal(title, text, [{ label: no, value: false }, { label: yes, value: true, primary: true }]);
}

/** Countdown-/Stoppuhr-Timer. mode "down" ruft onEnd. */
export class Timer {
  constructor({ seconds = 0, mode = "up", onTick, onEnd } = {}) {
    this.total = seconds;
    this.mode = mode;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.elapsed = 0;
    this.started = 0;
    this.iv = null;
  }
  start() {
    if (this.iv) return;
    this.started = Date.now() - this.elapsed * 1000;
    this.iv = setInterval(() => this.tick(), 250);
    this.tick();
  }
  pause() { clearInterval(this.iv); this.iv = null; }
  stop() { this.pause(); }
  get running() { return !!this.iv; }
  tick() {
    this.elapsed = (Date.now() - this.started) / 1000;
    const v = this.mode === "down" ? Math.max(0, this.total - this.elapsed) : this.elapsed;
    this.onTick && this.onTick(v, this);
    if (this.mode === "down" && v <= 0) {
      this.stop();
      this.onEnd && this.onEnd();
    }
  }
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

export function pct(score, max) {
  return max ? Math.round((score / max) * 100) : 0;
}

/** Normalisiert eine Antwort für den Vergleich (Groß/Klein, Leerzeichen, typografische Zeichen). */
export function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[„“”"']/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "");
}

/** Kleines Konfetti (CSS-Animation, schnell und sparsam). */
export function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const wrap = h("div.confetti");
  const colors = ["#58cc02", "#ffc800", "#1cb0f6", "#ff4b4b", "#ce82ff"];
  for (let i = 0; i < 28; i++) {
    wrap.append(h("i", { style: { left: Math.random() * 100 + "%", background: colors[i % colors.length], animationDelay: Math.random() * 0.3 + "s", transform: `rotate(${Math.random() * 360}deg)` } }));
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 1800);
}

export function progressBar(value, max, cls = "") {
  const p = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return h("div.bar" + (cls ? "." + cls : ""), h("span", { style: { width: p + "%" } }));
}
