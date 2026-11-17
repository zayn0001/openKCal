// Network-first: always fresh when online, last-seen copy when offline.
// The API is never cached: stale account or sync answers would be worse than none.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open('openkcal-v1').then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request)),
  )
})

// Meal reminders from the openKCal server (Settings → Reminders).
self.addEventListener('push', (e) => {
  let n = {}
  try {
    n = e.data.json()
  } catch {
    n = { title: 'openKCal', body: e.data?.text() || '' }
  }
  e.waitUntil(self.registration.showNotification(n.title || 'openKCal', { body: n.body, tag: n.tag, icon: '/favicon.svg', badge: '/favicon.svg' }))
})

// Tapping a reminder opens openKCal, or brings an open window to the front.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin)
      return open ? open.focus() : self.clients.openWindow('/')
    }),
  )
})
