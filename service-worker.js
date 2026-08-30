// Bump CACHE_NAME whenever app-shell files change so clients pick up the update.
const CACHE_NAME = "bible-questions-v39";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/base.css",
  "./css/questions.css",
  "./css/bible.css",
  "./css/planner.css",
  "./css/memorize.css",
  "./css/settings.css",
  "./firebase-config.js",
  "./esv-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./js/main.js",
  "./js/firebase.js",
  "./js/bible-data.js",
  "./js/bible-api.js",
  "./js/bible-reader.js",
  "./js/planner.js",
  "./js/default-reading-plan.js",
  "./js/daily-plan-data.js",
  "./js/memorize.js",
  "./js/memorize-data.js",
  "./js/verse-picker.js",
  "./js/questions.js",
  "./js/questions-data.js",
  "./js/question-bank-data.js",
  "./js/family-question-bank.js",
  "./js/users.js",
  "./js/active-user.js",
  "./js/age-groups-data.js",
  "./js/settings.js",
  "./js/setup-password.js",
  "./js/strongs-data.js",
  "./js/strongs-popup.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for app shell files so updates show up quickly; fall back to cache offline.
// Everything else (e.g. Firestore requests) goes straight to the network untouched.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
