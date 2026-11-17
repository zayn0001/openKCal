import { useEffect, useState, useMemo } from 'react'
import Icon from './components/Icon'
import Modals from './components/Modals'
import Toast from './components/Toast'
import TabBar from './components/TabBar'
import QuickAddModal from './components/QuickAddModal'
import Login from './Login'
import ProofPrompt from './ProofPrompt'
import { applyAccent } from './lib/accent'
import { logStreak } from './lib/nutrition'
import { detectOpenGym, OPENGYM_STORAGE_KEY, syncOpenGymData, syncRemoteOpenGym } from './lib/opengym'
import { today, useSettings, useStore } from './store'
import { useSync } from './sync'
import Diary from './views/Diary'
import Foods from './views/Foods'
import Trends from './views/Trends'
import CoachChat from './views/CoachChat'
import Settings from './views/Settings'
import Onboarding from './views/Onboarding'

const isWelcomeRoute = () =>
  typeof window !== 'undefined' &&
  (window.location.pathname === '/welcome' ||
    window.location.pathname === '/welcome/' ||
    window.location.hash === '#welcome' ||
    window.location.search.includes('welcome'))

export default function App() {
  const [tab, setTab] = useState('Diary')
  const [page, setPage] = useState(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(isWelcomeRoute)

  const { look } = useSettings()
  const { server, user, guest } = useSync()
  const diary = useStore((s) => s.diary) || {}
  const openGymSync = useStore((s) => s.openGymSync) || {}
  const openGymRemote = useStore((s) => s.openGymRemote) || {}

  useEffect(() => {
    const handlePopState = () => {
      setOnboardingOpen(isWelcomeRoute())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Apply theme & accent to document root
  useEffect(() => {
    const root = document.documentElement
    const resolvedTheme =
      look.theme === 'system'
        ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : look.theme

    if (look.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = look.theme

    applyAccent(root, look.accent, resolvedTheme)
  }, [look.theme, look.accent])

  // Auto-sync with openGym (Remote Server Token Sync & Local Browser Storage)
  useEffect(() => {
    const tryRemoteSync = async () => {
      const state = useStore.getState()
      if (state.openGymRemote?.connected && state.openGymRemote?.autoSync !== false) {
        await syncRemoteOpenGym(state)
      }
    }

    const tryLocalSync = () => {
      const detected = detectOpenGym()
      if (detected.detected && useStore.getState().openGymSync?.autoSync !== false) {
        syncOpenGymData(detected.raw, useStore.getState())
      }
    }

    const trySync = () => {
      tryRemoteSync()
      tryLocalSync()
    }

    const handleStorageChange = (e) => {
      if (e.key === OPENGYM_STORAGE_KEY) {
        tryLocalSync()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', trySync)
    trySync()

    // 30-second live polling interval for remote openGym revision check
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tryRemoteSync()
      }
    }, 30000)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', trySync)
      clearInterval(interval)
    }
  }, [])

  const streak = useMemo(() => logStreak(diary), [diary])

  const needsLogin = server && !user && !(guest && server.guests)

  const goSettings = (p = 'profile') => {
    setPage(p)
    setTab('Settings')
    window.scrollTo(0, 0)
  }

  const exitOnboarding = () => {
    setOnboardingOpen(false)
    if (typeof window !== 'undefined') {
      if (window.location.pathname === '/welcome' || window.location.pathname === '/welcome/') {
        window.history.pushState({}, '', '/')
      } else if (window.location.hash === '#welcome') {
        window.history.pushState({}, '', window.location.pathname)
      }
    }
  }

  if (onboardingOpen) {
    return <Onboarding onExit={exitOnboarding} />
  }

  return (
    <>
      <main>
        {/* App Top Bar */}
        {!needsLogin && tab === 'Diary' && (
          <header className="hdr" style={{ marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 'var(--fs-large)', letterSpacing: '-0.025em' }}>openKCal</h1>
              <p className="sub">Nutrition & calorie companion to openGym</p>
            </div>
            <div className="hdr-actions">
              {(openGymRemote.connected || openGymSync.lastSync) && (
                <button
                  type="button"
                  className="card tappable"
                  style={{
                    padding: '6px 10px',
                    margin: 0,
                    borderRadius: 99,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 'var(--fs-caption)',
                    fontWeight: 600,
                    border: '1px solid var(--sep)',
                  }}
                  onClick={() => goSettings('opengym')}
                  title="openGym Synced"
                >
                  <Icon name="dumbbell" className="font-lime" size={15} />
                  <span>Gym</span>
                </button>
              )}
              {streak > 0 && (
                <div
                  className="card tappable"
                  style={{
                    padding: '6px 10px',
                    margin: 0,
                    borderRadius: 99,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 'var(--fs-caption)',
                    fontWeight: 600,
                  }}
                  onClick={() => setTab('Trends')}
                >
                  <Icon name="flame" className="font-orange" />
                  <span>{streak}d</span>
                </div>
              )}
              <button
                type="button"
                className="iconbtn"
                onClick={() => setOnboardingOpen(true)}
                title="Welcome Guide & Android APK"
                aria-label="Welcome Guide & Android APK"
              >
                <Icon name="info" />
              </button>
              <button
                type="button"
                className="iconbtn"
                onClick={() => {
                  setPage(null)
                  setTab('Settings')
                }}
                aria-label="Settings"
              >
                <Icon name="gear" />
              </button>
            </div>
          </header>
        )}

        {needsLogin ? (
          <Login full onOpenWelcome={() => setOnboardingOpen(true)} />
        ) : (
          <>
            {tab === 'Diary' && <Diary goSettings={goSettings} />}
            {tab === 'Foods' && <Foods />}
            {tab === 'Trends' && <Trends />}
            {tab === 'Coach' && <CoachChat />}
            {tab === 'Settings' && <Settings page={page} setPage={setPage} />}
          </>
        )}
      </main>

      {/* openGym Bottom TabBar */}
      {!needsLogin && (
        <TabBar
          currentTab={tab}
          setTab={(t) => {
            setTab(t)
            if (t !== 'Settings') setPage(null)
            window.scrollTo(0, 0)
          }}
          onQuickLog={() => setQuickAddOpen(true)}
        />
      )}

      {/* Quick Add Modal from center + button */}
      {quickAddOpen && (
        <div className="sheet-backdrop" onClick={() => setQuickAddOpen(false)}>
          <div className="center" onClick={(e) => e.stopPropagation()}>
            <QuickAddModal
              date={today()}
              defaultMeal="Lunch"
              onClose={() => setQuickAddOpen(false)}
            />
          </div>
        </div>
      )}

      <Modals />
      <Toast />
      <ProofPrompt />
    </>
  )
}
