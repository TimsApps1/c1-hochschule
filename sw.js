// Service Worker: cacht beim ersten Öffnen alle App-Dateien und Inhalte → offline nutzbar.
// Bei jedem Deploy CACHE_VERSION erhöhen (scripts/validate.mjs erinnert daran nicht – bitte selbst!).
const CACHE_VERSION = "v2";
const CACHE = "c1hs-" + CACHE_VERSION;

const CORE = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/ai.js", "./js/analytics.js", "./js/config.js", "./js/content.js", "./js/db.js", "./js/dropbox.js",
  "./js/fehler.js", "./js/gamify.js", "./js/hoeren.js", "./js/lesen.js", "./js/pruefung.js", "./js/quiz.js", "./js/recorder.js",
  "./js/sb.js", "./js/schreiben.js", "./js/session.js", "./js/sprechen.js", "./js/srs.js", "./js/store.js", "./js/sync.js",
  "./js/tts.js", "./js/ui.js", "./js/vocab.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/icon.svg",
];
const DATA = [
  "wortschatz_a.json", "wortschatz_b.json", "redewendungen.json", "sb_a.json", "sb_b.json", "drills_a.json", "drills_b.json",
  "grammatik_a.json", "grammatik_b.json", "lesen_a.json", "lesen_b.json", "hoeren_1.json", "hoeren_2.json", "hoeren_3.json",
  "schreiben.json", "sprechen.json", "strategie.json", "links.json", "lernpfad.json",
].map((f) => "./data/" + f);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.all(DATA.map((u) => cache.add(u).catch(() => null)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Code (HTML/JS/CSS): network-first (nie alte und neue Module mischen); Inhalte/Icons: cache-first + Hintergrund-Update.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const isNav = event.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");
  const isCode = isNav || /\.(js|css|webmanifest)$/.test(url.pathname);
  const cacheKey = isNav ? new URL("./index.html", self.location.href).toString() : url.origin + url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isCode) {
      try {
        const res = await fetch(event.request);
        if (res.ok) cache.put(cacheKey, res.clone());
        return res;
      } catch (e) {
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
        throw e;
      }
    }
    const cached = await cache.match(cacheKey);
    if (cached) {
      fetch(event.request).then((res) => { if (res.ok) cache.put(cacheKey, res.clone()); }).catch(() => {});
      return cached;
    }
    const res = await fetch(event.request);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
