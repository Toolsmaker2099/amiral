// Service worker d'Amiral : garde le jeu en cache pour jouer hors ligne.
// Mise à jour silencieuse : à chaque ouverture, les fichiers du jeu sont revalidés
// auprès du serveur (sans attendre le cache HTTP de GitHub Pages) ; le cache ne sert
// que hors ligne. Aucun message n'est jamais affiché au joueur.
const VERSION = 'amiral-v6';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/engine.js',
  './src/ai.js',
  './src/ui.js',
  './src/online.js',
  './src/hub.js',
  './src/morpion.js',
  './src/notify.js',
  './src/share.js',
  './src/config.js',
  './src/vendor/qrcode.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages : le réseau d'abord, le cache si on est hors ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Fichiers du jeu : le réseau d'abord, le cache hors ligne.
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Polices Google : le cache d'abord, elles ne changent pas.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
      }))
    );
  }
});
