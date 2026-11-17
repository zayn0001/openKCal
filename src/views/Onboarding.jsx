import { useState, useEffect } from 'react'
import Icon from '../components/Icon'

export default function Onboarding({ onExit }) {
  const [apkMeta, setApkMeta] = useState({
    version: '0.3.0',
    size: '3.3 MB',
    sha256: '',
  })

  useEffect(() => {
    const tryFetch = (url) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)

    tryFetch('/download/openkcal.json')
      .then((a) => a || tryFetch('/download/thally.json'))
      .then((a) => {
        if (!a) return
        setApkMeta({
          version: a.version || '0.3.0',
          size: a.size ? `${(a.size / 1048576).toFixed(1)} MB` : '3.3 MB',
          sha256: a.sha256 || '',
        })
      })
      .catch(() => {})
  }, [])

  return (
    <div className="onboarding-page" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--label)' }}>
      {/* Sticky Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--sep)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onExit && (
            <button
              type="button"
              className="iconbtn"
              onClick={onExit}
              title="Return to App"
              aria-label="Return to App"
            >
              <Icon name="chevronLeft" />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--lime)',
                display: 'inline-grid',
                placeItems: 'center',
                color: '#000',
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              K
            </span>
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em' }}>openKCal</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            href="/download/openkcal.apk"
            download
            className="btn sm tinted"
            style={{ textDecoration: 'none' }}
          >
            <Icon name="download" /> APK ({apkMeta.size})
          </a>
          {onExit && (
            <button type="button" className="btn sm primary" onClick={onExit}>
              Open App <Icon name="chevronRight" />
            </button>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 60px' }}>
        {/* Hero Section */}
        <div style={{ textAlign: 'center', padding: '24px 0 36px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 99,
              background: 'var(--subtle)',
              border: '1px solid var(--sep)',
              fontSize: 'var(--fs-caption)',
              fontWeight: 600,
              color: 'var(--lime)',
              marginBottom: 16,
            }}
          >
            <Icon name="dumbbell" size={14} /> Open-Source Companion to openGym
          </span>

          <h1
            style={{
              fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: '0 0 16px',
            }}
          >
            Every calorie, <span style={{ color: 'var(--acc)' }}>accounted for.</span>
          </h1>

          <p
            className="muted"
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              maxWidth: 620,
              margin: '0 auto 24px',
              lineHeight: 1.5,
            }}
          >
            Snap a food photo to build an ingredient dish, scan package nutrition labels with AI, or speak naturally. Synchronizes live with your openGym workouts, calorie burns & scale weights.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
            {onExit && (
              <button
                type="button"
                className="btn primary lg"
                onClick={onExit}
                style={{ padding: '12px 24px', fontSize: 'var(--fs-body)' }}
              >
                <Icon name="play" /> Start Tracking Now
              </button>
            )}
            <a
              href="/download/openkcal.apk"
              download
              className="btn tinted lg"
              style={{ padding: '12px 20px', textDecoration: 'none' }}
            >
              <Icon name="download" /> Download APK ({apkMeta.size})
            </a>
            <a
              href="https://github.com/openkcal/openkcal/releases/latest/download/openkcal.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost lg"
              style={{ padding: '12px 20px', textDecoration: 'none' }}
            >
              GitHub Release
            </a>
          </div>

          <p className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            100% Free & Open-Source · Zero Ads · No Subscriptions · Offline First
          </p>
        </div>

        {/* Visual Macro Thali Plate */}
        <div
          className="card"
          style={{
            padding: 24,
            marginBottom: 36,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'var(--card)',
          }}
        >
          <svg
            viewBox="0 0 520 520"
            role="img"
            aria-label="A thali with two rotis, dal, bhindi, rajma, curd and rice, adding up to 1,184 kcal and 46 g of protein"
            style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block' }}
          >
            <circle cx="260" cy="260" r="248" fill="#2a2e39" />
            <circle cx="260" cy="260" r="232" fill="#1c1f26" stroke="#3a404d" strokeWidth="2" />
            <g>
              <circle cx="119" cy="209" r="62" fill="#2e3440" />
              <circle cx="119" cy="209" r="52" fill="#e3a21a" />
              <text x="119" y="206" textAnchor="middle" fill="#000" fontSize="16" fontWeight="700">Dal</text>
              <text x="119" y="226" textAnchor="middle" fill="#000" fontSize="13">218 kcal</text>
            </g>
            <g>
              <circle cx="197" cy="124" r="62" fill="#2e3440" />
              <circle cx="197" cy="124" r="52" fill="#30d158" />
              <text x="197" y="121" textAnchor="middle" fill="#000" fontSize="16" fontWeight="700">Bhindi</text>
              <text x="197" y="141" textAnchor="middle" fill="#000" fontSize="13">96 kcal</text>
            </g>
            <g>
              <circle cx="323" cy="124" r="62" fill="#2e3440" />
              <circle cx="323" cy="124" r="52" fill="#ff453a" />
              <text x="323" y="121" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">Rajma</text>
              <text x="323" y="141" textAnchor="middle" fill="#fff" fontSize="13">203 kcal</text>
            </g>
            <g>
              <circle cx="401" cy="209" r="62" fill="#2e3440" />
              <circle cx="401" cy="209" r="52" fill="#fbfaf4" />
              <text x="401" y="206" textAnchor="middle" fill="#111" fontSize="16" fontWeight="700">Curd</text>
              <text x="401" y="226" textAnchor="middle" fill="#111" fontSize="13">61 kcal</text>
            </g>
            <ellipse cx="190" cy="372" rx="78" ry="74" fill="#d2a86c" />
            <ellipse cx="172" cy="358" rx="78" ry="74" fill="#e2bd84" />
            <text x="172" y="356" textAnchor="middle" fill="#111" fontSize="16" fontWeight="700">2 Rotis</text>
            <text x="172" y="376" textAnchor="middle" fill="#111" fontSize="13">238 kcal</text>
            <ellipse cx="350" cy="370" rx="82" ry="62" fill="#fbfaf4" />
            <text x="350" y="368" textAnchor="middle" fill="#111" fontSize="16" fontWeight="700">Rice</text>
            <text x="350" y="388" textAnchor="middle" fill="#111" fontSize="13">368 kcal</text>
            <rect x="176" y="218" width="168" height="74" rx="37" fill="#000" stroke="#30d158" strokeWidth="2" />
            <text x="260" y="254" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="800">1,184 kcal</text>
            <text x="260" y="276" textAnchor="middle" fill="#30d158" fontSize="14" fontWeight="600">46g Protein</text>
          </svg>
          <p className="muted" style={{ marginTop: 16, fontSize: 'var(--fs-caption)', textAlign: 'center' }}>
            Built for everyday cooking: official Indian Food Composition Tables (IFCT 2017) + 5,431 cooked recipes.
          </p>
        </div>

        {/* Feature Grid */}
        <h2 style={{ fontSize: 'var(--fs-title2)', fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
          Core Capabilities
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 36 }}>
          <div className="card" style={{ padding: 18 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--lime)', marginBottom: 12 }}>
              <Icon name="camera" />
            </span>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 6px' }}>Photo Meal to Recipe Dish</h3>
            <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: 0, lineHeight: 1.5 }}>
              Click a photo of your food. openKCal detects ingredients, portion sizes, and lets you 1-tap save it as a permanent community recipe dish or log to your diary.
            </p>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--orange)', marginBottom: 12 }}>
              <Icon name="barcode" />
            </span>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 6px' }}>Nutrition Label OCR</h3>
            <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: 0, lineHeight: 1.5 }}>
              Snap the nutrition facts label on packaged foods (+ optional package front photo) to parse calories, protein, carbs, fat, fiber, and sodium in seconds.
            </p>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--lime)', marginBottom: 12 }}>
              <Icon name="dumbbell" />
            </span>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 6px' }}>openGym Live Auto-Sync</h3>
            <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: 0, lineHeight: 1.5 }}>
              Connect via official 6-character openGym pairing code. Workouts automatically convert to active calorie burns, and weigh-ins feed dynamic TDEE calculations.
            </p>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--blue)', marginBottom: 12 }}>
              <Icon name="bowl" />
            </span>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 6px' }}>Shared Community Foods</h3>
            <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: 0, lineHeight: 1.5 }}>
              Every custom food and recipe dish created by any user is immediately published to the shared registry for everyone on the server to search and log.
            </p>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--purple)', marginBottom: 12 }}>
              <Icon name="chat" />
            </span>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 6px' }}>AI Nutritionist Coach</h3>
            <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: 0, lineHeight: 1.5 }}>
              Ask Coach Ria for high-protein Indian swaps, dinner ideas for remaining calories, or analyze meal photos directly inside your chat stream.
            </p>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--teal)', marginBottom: 12 }}>
              <Icon name="lock" />
            </span>
            <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 6px' }}>Privacy & Ownership</h3>
            <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: 0, lineHeight: 1.5 }}>
              Self-host or run completely offline on your device. Export raw data to CSV or JSON anytime. Zero analytics, trackers, or commercial monetization.
            </p>
          </div>
        </div>

        {/* Download Android APK Card */}
        <div
          className="card"
          id="get-apk"
          style={{
            padding: 24,
            marginBottom: 36,
            border: '2px solid var(--acc)',
            background: 'var(--card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span className="lrow-i" style={{ '--tint': 'var(--acc)' }}>
              <Icon name="download" />
            </span>
            <div>
              <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: 0 }}>Download Android APK</h3>
              <span className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
                Version {apkMeta.version} · Android 7.0+ · Signed Release
              </span>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Install openKCal directly onto your phone. Keep your nutrition diary completely offline or connect your server anytime.
          </p>

          <ol style={{ paddingLeft: 20, margin: '0 0 20px', fontSize: 'var(--fs-subhead)', color: 'var(--label-2)', lineHeight: 1.6 }}>
            <li>Tap <strong>Direct APK Download</strong> below.</li>
            <li>Open the file when downloaded. If Android prompts you, tap <strong>Settings</strong> and allow <em>Install unknown apps</em> for your browser.</li>
            <li>Launch openKCal, set your macro targets, or link your openGym instance!</li>
          </ol>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href="/download/openkcal.apk"
              download
              className="btn primary"
              style={{ padding: '10px 18px', textDecoration: 'none' }}
            >
              <Icon name="download" /> Direct APK Download ({apkMeta.size})
            </a>
            <a
              href="https://github.com/openkcal/openkcal/releases/latest/download/openkcal.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="btn tinted"
              style={{ padding: '10px 18px', textDecoration: 'none' }}
            >
              GitHub Release APK
            </a>
          </div>

          {apkMeta.sha256 && (
            <div style={{ marginTop: 16, fontSize: '11px', color: 'var(--muted)', wordBreak: 'break-all' }}>
              SHA-256 Checksum: <code>{apkMeta.sha256}</code>
            </div>
          )}
        </div>

        {/* Self Hosting Section */}
        <div className="card" style={{ padding: 20, marginBottom: 36 }}>
          <h3 style={{ fontSize: 'var(--fs-body)', fontWeight: 700, margin: '0 0 8px' }}>
            Deploy Your Own Server
          </h3>
          <p className="muted" style={{ fontSize: 'var(--fs-subhead)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Run openKCal for your entire family or training group with Docker Compose. Keeps phones, laptops, and tablets in sync.
          </p>
          <pre style={{ background: '#000', padding: 12, borderRadius: 8, fontSize: 13, overflowX: 'auto', margin: '0 0 12px' }}>
            <code>docker compose up -d</code>
          </pre>
          <span className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            <strong>Using iPhone?</strong> Open your openKCal URL in Safari, then tap <em>Share → Add to Home Screen</em> for full-screen PWA mode.
          </span>
        </div>

        {/* Return to App Button */}
        {onExit && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              type="button"
              className="btn primary lg"
              onClick={onExit}
              style={{ padding: '12px 28px', fontSize: 'var(--fs-body)' }}
            >
              <Icon name="play" /> Launch openKCal App
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
