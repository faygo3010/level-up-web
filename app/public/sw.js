// Network-first service worker: always try fresh, fall back to cache offline.
// The cache is bounded so old hashed build files don't pile up forever.
const CACHE = 'levelup-v3'
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
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // Never cache sign-in hand-offs: their URLs carry one-time codes.
  if (url.pathname.endsWith('/connect-google.html')) return
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
