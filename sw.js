/* Guarda la pantalla en el celular para que abra al instante y sin señal (letra e íconos incluidos: todo es de la app).
   Las llamadas a la hoja nunca se guardan. */
const VERSION = 'gasto-v8';
const BASE = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'letra-e-iconos.css', 'fuentes/manrope-latin.woff2', 'fuentes/manrope-latin-ext.woff2', 'fuentes/tabler-icons.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;   // la hoja: siempre por red

  if (url.origin === location.origin) {   // la app: abre con lo guardado y se actualiza por detrás
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
      const red = fetch(req).then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
        return res;
      }).catch(() => hit);
      return hit || red;
    }));
  }
});
