// Retire the old offline-first worker. It clears its cache and unregisters
// itself, so a refresh after `npm run dev` stops cannot load a saved app shell.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("smritiai-")).map((key) => caches.delete(key))))
    .then(() => self.registration.unregister())
));