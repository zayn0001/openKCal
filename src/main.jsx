import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { isNativeApp } from './api'
import { newVersionReady } from './lib/update'
import { useUI } from './store/useUI'
import { startSync } from './sync'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support; production only so the dev server never serves stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')

startSync()

// A new deploy: offer a reload, so an installed web app (no reload button) still gets it. The
// Android/iOS apps carry their own copy and update through the APK / store instead.
if (import.meta.env.PROD && !isNativeApp()) {
  const check = async () => {
    if (document.visibilityState === 'visible' && (await newVersionReady()))
      useUI.getState().toast('A new version of openKCal is ready', { action: 'Reload', onAction: () => location.reload(), ms: 10 * 60_000 })
  }
  document.addEventListener('visibilitychange', check) // coming back to the app
  setInterval(check, 15 * 60_000)
  setTimeout(check, 10_000)
}
