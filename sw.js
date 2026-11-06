// Service worker: rende il sito installabile e utilizzabile anche senza rete.
// Strategia "prima la rete": si scarica sempre la versione aggiornata e la copia in cache
// viene usata solo se la rete non c'è. Così gli aggiornamenti arrivano subito.
const CACHE = 'dizione-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;   // Firebase, font, ecc.: non toccati
  e.respondWith((async () => {
    try {
      // 'no-cache': chiede sempre al server se il file è cambiato (risposta leggera se non lo è),
      // così dopo un aggiornamento del sito non si resta con la versione vecchia per 10 minuti
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('./')) || (await caches.match('./index.html'));
      throw new Error('offline');
    }
  })());
});
