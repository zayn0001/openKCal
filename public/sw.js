// Network-first: always fresh when online, last-seen copy when offline.
// The API is never cached: stale account or sync answers would be worse than none.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open('thali-v1').then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request)),
  )
})
