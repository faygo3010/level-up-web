// Network-first service worker: always try fresh, fall back to cache offline.
// The cache is bounded so old hashed build files don't pile up forever.
const CACHE = 'levelup-v2'
const MAX_ENTRIES = 60

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
)

async function trim(cache) {
  const keys = await cache.keys()
  for (const req of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(req)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy).then(() => trim(c)))
        }
        return res
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./'))),
  )
})
