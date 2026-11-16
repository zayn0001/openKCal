import { useEffect, useState } from 'react'
import Login from './Login'
import ProofPrompt from './ProofPrompt'
import { useSettings } from './store'
import { useSync } from './sync'
import Diary from './views/Diary'
import Foods from './views/Foods'
import Settings from './views/Settings'
import Weight from './views/Weight'

// ponytail: tab state instead of a router; add react-router when screens need URLs.
export default function App() {
  const [tab, setTab] = useState('Diary')
  const [page, setPage] = useState(null) // open settings page
  const { look, modules } = useSettings()
  const { server, user, guest } = useSync()

  useEffect(() => {
    const root = document.documentElement
    if (look.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = look.theme
    root.dataset.accent = look.accent
  }, [look.theme, look.accent])

  // A server that doesn't allow guests needs a sign-in first; one that does offers it.
  const needsLogin = server && !user && !(guest && server.guests)
  const tabs = ['Diary', 'Foods', ...(modules.weight ? ['Weight'] : []), 'Settings']
  const current = tabs.includes(tab) ? tab : 'Diary'
  const goSettings = (p = 'profile') => {
    setPage(p)
    setTab('Settings')
  }

  return (
    <>
      <main>
        <h1>Thally</h1>
        {needsLogin ? (
          <Login full />
        ) : (
          <>
            {current === 'Diary' && <Diary goSettings={goSettings} />}
            {current === 'Foods' && <Foods />}
            {current === 'Weight' && <Weight />}
            {current === 'Settings' && <Settings page={page} setPage={setPage} />}
          </>
        )}
      </main>
      {!needsLogin && (
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={current === t ? 'page' : undefined}
              onClick={() => {
                setTab(t)
                if (t === 'Settings') setPage(null)
              }}
            >
              {t}
            </button>
          ))}
        </nav>
      )}
      <ProofPrompt />
    </>
  )
}
