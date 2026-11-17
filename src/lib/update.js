// Spotting a new deploy of the web app: every build gives the main bundle a new hashed name, so
// if the server's index.html points at a different one than the page that is running, there is
// a newer version and a reload picks it up (the service worker is network-first).

/** The main bundle an index.html loads, e.g. "/assets/index-AbC123.js", or null. */
export const bundleOf = (html) => /\/assets\/index-[\w-]+\.js/.exec(html || '')?.[0] || null

export async function newVersionReady() {
  const mine = bundleOf(document.documentElement.outerHTML)
  if (!mine) return false // the dev server, which has no bundle
  const html = await fetch('/', { cache: 'no-store' })
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '') // offline: nothing newer to get anyway
  const latest = bundleOf(html)
  return !!latest && latest !== mine
}
