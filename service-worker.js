// Guarda la app en el móvil para que funcione sin internet. Los residentes NO van aquí: se cargan desde la app.
// Con internet siempre carga la última versión; sin internet usa la copia guardada.
const CACHE = 'pasar-lista-v21';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
function conLimite(p, ms) { return new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error('tiempo')), ms); p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); ko(e); }); }); }
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // La descarga sigue aunque tarde: si no llega a tiempo se abre la copia guardada,
    // pero la versión nueva se guarda igualmente y sale la próxima vez que se abra la app.
    let copia = null;
    const red = fetch(req, { cache: 'no-store' }).then(res => { if (res.ok) copia = res.clone(); return res; });
    e.waitUntil(red.then(() => copia && caches.open(CACHE).then(c => c.put('./index.html', copia))).catch(() => {}));
    e.respondWith(conLimite(red, 6000).catch(() => caches.match('./index.html').then(r => r || red)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return res;
  })));
});
