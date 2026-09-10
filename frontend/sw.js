const CACHE = "smritiai-v3";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.json",
  "./js/db.js", "./js/i18n.js", "./js/seed.js", "./js/api.js", "./js/analytics.js", "./js/games.js",
  "./assets/icons/icon.svg", "./assets/images/demo-ananya.png", "./assets/images/demo-ranjit.png", "./assets/images/demo-mili.png",
  "./assets/vendor/chart.umd.js", "./assets/vendor/jspdf.umd.min.js"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ offline: true }), { status: 503, headers: { "Content-Type": "application/json" } })));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok && url.origin === location.origin) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match("./index.html"))));
});
self.addEventListener("sync", (event) => { if (event.tag === "smritiai-sync") event.waitUntil(self.clients.matchAll({ type: "window" }).then((clients) => clients.forEach((client) => client.postMessage({ type: "SYNC_REQUESTED" })))); });

