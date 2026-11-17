import { useState, useRef } from 'react'
import Icon from '../components/Icon'
import { Button, Switch, Row, Section, TextField } from '../components/ui'
import { useUI } from '../store/useUI'
import { useStore } from '../store'
import {
  detectOpenGym,
  parseOpenGymBackup,
  syncOpenGymData,
  redeemPairingCode,
  verifyOpenGymToken,
  syncRemoteOpenGym,
} from '../lib/opengym'

export function OpenGymPage() {
  const store = useStore()
  const toast = useUI((s) => s.toast)
  const openGymRemote = useStore((s) => s.openGymRemote) || {}
  const [detection, setDetection] = useState(() => detectOpenGym())
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Connection form state
  const [authMode, setAuthMode] = useState('code') // 'code' | 'token'
  const [serverUrl, setServerUrl] = useState('http://localhost:8080')
  const [pairingCode, setPairingCode] = useState('')
  const [bearerToken, setBearerToken] = useState('')

  const fileInputRef = useRef(null)

  // Handle remote pairing code redemption
  const handleConnectCode = async (e) => {
    e?.preventDefault()
    if (!pairingCode.trim()) {
      toast('Please enter a pairing code from openGym', { kind: 'error' })
      return
    }

    setConnecting(true)
    try {
      const res = await redeemPairingCode(serverUrl, pairingCode)
      store.setOpenGymRemote({
        connected: true,
        serverUrl: res.serverUrl,
        token: res.token,
        user: res.user,
        lastSync: Date.now(),
        autoSync: true,
      })

      // Run initial sync immediately
      const syncRes = await syncRemoteOpenGym(useStore.getState(), true)
      if (syncRes.success) {
        toast(`Connected to openGym! Synced ${syncRes.stats?.workoutsAdded || 0} workouts and ${syncRes.stats?.weightsAdded || 0} weigh-ins.`)
      } else {
        toast(`Connected to openGym as ${res.user?.name || 'User'}!`)
      }
      setPairingCode('')
    } catch (err) {
      toast(`Connection failed: ${err.message}`, { kind: 'error' })
    } finally {
      setConnecting(false)
    }
  }

  // Handle direct bearer token connection
  const handleConnectToken = async (e) => {
    e?.preventDefault()
    if (!bearerToken.trim()) {
      toast('Please enter an API or Bearer token', { kind: 'error' })
      return
    }

    setConnecting(true)
    try {
      const res = await verifyOpenGymToken(serverUrl, bearerToken)
      store.setOpenGymRemote({
        connected: true,
        serverUrl: res.serverUrl,
        token: res.token,
        user: null,
        lastRev: res.rev,
        lastSync: Date.now(),
        autoSync: true,
      })

      // Initial sync
      const syncRes = await syncRemoteOpenGym(useStore.getState(), true)
      toast(`Connected with token! Synced ${syncRes.stats?.workoutsAdded || 0} workouts.`)
      setBearerToken('')
    } catch (err) {
      toast(`Token verification failed: ${err.message}`, { kind: 'error' })
    } finally {
      setConnecting(false)
    }
  }

  // Manual remote sync trigger
  const handleSyncRemoteNow = async () => {
    setSyncing(true)
    try {
      const res = await syncRemoteOpenGym(useStore.getState(), true)
      if (res.success) {
        if (res.updated) {
          toast(`Synced with openGym: +${res.stats?.workoutsAdded || 0} workouts, +${res.stats?.weightsAdded || 0} weigh-ins.`)
        } else {
          toast('openGym is already up to date.')
        }
      } else {
        toast(`Sync failed: ${res.error || res.reason}`, { kind: 'error' })
      }
    } catch (err) {
      toast(`Sync error: ${err.message}`, { kind: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  // Disconnect remote
  const handleDisconnect = () => {
    if (confirm('Disconnect live sync with openGym server?')) {
      store.disconnectOpenGymRemote()
      toast('Disconnected from openGym server.')
    }
  }

  // Local storage sync
  const handleSyncLocal = () => {
    setSyncing(true)
    try {
      const detected = detectOpenGym()
      if (!detected.detected) {
        toast('openGym local data not found in this browser.', { kind: 'error' })
        setSyncing(false)
        return
      }

      const res = syncOpenGymData(detected.raw, useStore.getState())
      if (res.success) {
        setDetection(detected)
        toast(
          `Synced local openGym: ${res.workoutsAdded} workouts, ${res.weightsAdded} weigh-ins, ${res.measurementsAdded} measurements.`,
        )
      } else {
        toast('Failed to sync openGym data.', { kind: 'error' })
      }
    } catch (err) {
      toast(`Sync error: ${err.message}`, { kind: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  // Import backup file
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const text = await file.text()
      const parsed = parseOpenGymBackup(text)
      if (!parsed) {
        toast('Invalid file: not recognized as an openGym JSON or CSV export.', { kind: 'error' })
        return
      }

      const res = syncOpenGymData(parsed, useStore.getState())
      if (res.success) {
        toast(
          `Imported from openGym: ${res.workoutsAdded} workouts, ${res.weightsAdded} weigh-ins, ${res.measurementsAdded} measurements.`,
        )
      } else {
        toast('Failed to import openGym data.', { kind: 'error' })
      }
    } catch (err) {
      toast(`Import failed: ${err.message}`, { kind: 'error' })
    }
  }

  const formatLastSync = (ts) => {
    if (!ts) return 'Never'
    const d = new Date(ts)
    return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Overview Card */}
      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: 'var(--lime)',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 20,
            }}
          >
            <Icon name="dumbbell" size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 'var(--fs-title2)', margin: 0, fontWeight: 700 }}>openGym Live Sync</h2>
            <p className="sub" style={{ margin: 0 }}>
              Official pairing & token integration with openGym
            </p>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-sub)', lineHeight: 1.4, margin: '8px 0 16px' }}>
          Connect openKCal to your openGym server using a pairing code or API token. openKCal polls revisions in the background so workouts and weigh-ins logged in openGym automatically count towards your calorie budget and trend charts in real time.
        </p>

        {/* CONNECTION STATUS */}
        {openGymRemote.connected ? (
          <div
            style={{
              backgroundColor: 'var(--surface-2)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid var(--sep)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    backgroundColor: 'var(--green)',
                    display: 'inline-block',
                    boxShadow: '0 0 8px var(--green)',
                  }}
                />
                <strong style={{ fontSize: 'var(--fs-body)', color: 'var(--text)' }}>
                  Connected to openGym Server
                </strong>
              </div>
              <span className="pill" style={{ fontSize: 11, backgroundColor: 'var(--surface)', border: '1px solid var(--sep)' }}>
                Live
              </span>
            </div>

            <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>Server: <strong style={{ color: 'var(--text)' }}>{openGymRemote.serverUrl}</strong></div>
              {openGymRemote.user?.name && (
                <div>Account: <strong style={{ color: 'var(--text)' }}>{openGymRemote.user.name}</strong></div>
              )}
              <div>Last Synced: <span>{formatLastSync(openGymRemote.lastSync)}</span></div>
              {openGymRemote.lastRev && (
                <div>Revision: <code style={{ fontSize: 11 }}>{openGymRemote.lastRev}</code></div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                variant="primary"
                onClick={handleSyncRemoteNow}
                disabled={syncing}
                icon="arrowClockwise"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          /* CONNECT FORM */
          <div
            style={{
              backgroundColor: 'var(--surface-2)',
              borderRadius: 12,
              padding: '16px',
              border: '1px solid var(--sep)',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 'var(--fs-title3)' }}>Pair with openGym</h3>

            {/* Auth mode toggle */}
            <div className="seg" style={{ '--n': 2, '--i': authMode === 'code' ? 0 : 1, marginBottom: 14 }}>
              <span className="seg-sel" aria-hidden="true" />
              <button
                type="button"
                className={authMode === 'code' ? 'on' : ''}
                onClick={() => setAuthMode('code')}
              >
                Pairing Code (Recommended)
              </button>
              <button
                type="button"
                className={authMode === 'token' ? 'on' : ''}
                onClick={() => setAuthMode('token')}
              >
                API Bearer Token
              </button>
            </div>

            <form onSubmit={authMode === 'code' ? handleConnectCode : handleConnectToken}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <TextField
                  label="openGym Server Address"
                  placeholder="http://localhost:8080 or https://gym.example.com"
                  value={serverUrl}
                  onChange={setServerUrl}
                />

                {authMode === 'code' ? (
                  <div>
                    <TextField
                      label="6-Character Pairing Code"
                      placeholder="e.g. 7KX92M"
                      value={pairingCode}
                      onChange={(v) => setPairingCode(v.toUpperCase())}
                      style={{ letterSpacing: '0.15em', fontWeight: 700 }}
                    />
                    <p className="muted" style={{ fontSize: 'var(--fs-caption)', margin: '6px 0 0' }}>
                      In openGym: Go to <strong>Settings → Pair the mobile app</strong>, confirm your identity, and enter the code shown on screen.
                    </p>
                  </div>
                ) : (
                  <div>
                    <TextField
                      label="openGym Bearer Token"
                      placeholder="Paste your openGym token..."
                      value={bearerToken}
                      onChange={setBearerToken}
                    />
                    <p className="muted" style={{ fontSize: 'var(--fs-caption)', margin: '6px 0 0' }}>
                      Paste a valid Bearer token generated for your openGym profile.
                    </p>
                  </div>
                )}

                <div style={{ marginTop: 6 }}>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={connecting}
                    icon="key"
                  >
                    {connecting ? 'Connecting...' : authMode === 'code' ? 'Pair & Start Live Sync' : 'Connect Token'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* Sync Preferences Section */}
      <Section title="Sync Preferences">
        <Row
          icon="timer"
          title="Live Background Auto-Sync"
          subtitle="Automatically checks openGym revision and updates data in real-time"
        >
          <Switch
            checked={openGymRemote.autoSync !== false}
            onChange={(checked) => store.setOpenGymRemote({ autoSync: checked })}
            disabled={!openGymRemote.connected}
          />
        </Row>
      </Section>

      {/* Alternative Local & File Sync */}
      <Section title="Offline & File Backup Options">
        <Row
          icon="download"
          title="Import openGym Backup File"
          subtitle="Import an openGym backup (.json) or spreadsheet (.csv)"
          accessory="chevron"
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,text/csv,application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        {detection.detected && (
          <Row
            icon="dumbbell"
            title="Sync Local Browser openGym"
            subtitle={`${detection.workoutsCount} workouts and ${detection.weightsCount} weigh-ins detected in local storage`}
            accessory="chevron"
            onClick={handleSyncLocal}
          />
        )}
      </Section>

      {/* Data Mapping Explanation */}
      <Section title="How openGym Data is Synchronized">
        <Row
          icon="dumbbell"
          title="Active Workout Calories (MET Formula)"
          subtitle="Strength and cardio workouts are calculated with MET formulas and offset your daily calorie budget (Remaining = Goal - Eaten + Burned)"
        />
        <Row
          icon="scale"
          title="Weigh-ins & TDEE Planner"
          subtitle="Weigh-ins automatically update your progress charts and recalculate your daily BMR/TDEE targets"
        />
        <Row
          icon="sparkles"
          title="Body Measurements"
          subtitle="Waist, hips, chest, arm, and body fat percentage trackings are unified"
        />
      </Section>
    </div>
  )
}
