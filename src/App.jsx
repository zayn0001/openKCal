import { useState } from 'react'
import Diary from './views/Diary'
import Foods from './views/Foods'
import Profile from './views/Profile'
import Weight from './views/Weight'

const TABS = ['Diary', 'Foods', 'Weight', 'Profile']

// ponytail: tab state instead of a router; add react-router when screens need URLs.
export default function App() {
  const [tab, setTab] = useState('Diary')
  return (
    <>
      <main>
        <h1>Thali</h1>
        {tab === 'Diary' && <Diary goProfile={() => setTab('Profile')} />}
        {tab === 'Foods' && <Foods />}
        {tab === 'Weight' && <Weight />}
        {tab === 'Profile' && <Profile />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
    </>
  )
}
