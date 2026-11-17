import Icon from '../components/Icon'
import Onboarding from './Onboarding'
import { AccountPage } from '../settings/account'
import { AdminPage } from '../settings/admin'
import { AiPage } from '../settings/ai'
import { AboutPage, LookPage, ModulesPage, ProfilePage, UnitsPage } from '../settings/basic'
import { DataPage } from '../settings/data'
import { IntegrationsPage } from '../settings/integrations'
import { OpenGymPage } from '../settings/opengym'
import { RemindersPage } from '../settings/reminders'
import { useSettings } from '../store'
import { useSync } from '../sync'

const PAGES = {
  profile: { title: 'Profile & Targets', hint: 'Body, activity and fitness goal', icon: 'person', tint: 'var(--blue)', Page: ProfilePage },
  opengym: { title: 'openGym Connection', hint: 'Sync workouts, body weight & measurements', icon: 'opengym', tint: 'var(--lime)', Page: OpenGymPage },
  welcome: { title: 'Welcome Guide & APK', hint: 'Overview, features & Android APK download', icon: 'sparkles', tint: 'var(--turmeric)', Page: Onboarding },
  modules: { title: 'Modules', hint: 'Turn parts of openKCal on and off', icon: 'list', tint: 'var(--green)', Page: ModulesPage },
  units: { title: 'Units', hint: 'kcal or kJ, kg or lb, cm or inches', icon: 'scale', tint: 'var(--orange)', Page: UnitsPage },
  look: { title: 'Look & Feel', hint: 'Theme and accent colors', icon: 'sun', tint: 'var(--purple)', Page: LookPage },
  reminders: { title: 'Reminders', hint: 'Meal reminders by notification', icon: 'bell', tint: 'var(--red)', Page: RemindersPage, mod: 'reminders', when: (c) => !!c.server },
  ai: { title: 'AI Configuration', hint: 'Own AI provider for photo logging and reviews', icon: 'sparkles', tint: 'var(--teal)', Page: AiPage, mod: 'ai', when: (c) => !!c.server },
  integrations: { title: 'Integrations', hint: 'Webhooks to Home Assistant, n8n, ntfy…', icon: 'plug', tint: 'var(--indigo)', Page: IntegrationsPage, mod: 'webhooks', when: (c) => !!c.server },
  data: { title: 'Data & Backup', hint: 'Export, import, spreadsheets, reset', icon: 'share', tint: 'var(--mint)', Page: DataPage },
  account: { title: 'Account', hint: 'Sign-in, passkeys, devices', icon: 'key', tint: 'var(--grey)', Page: AccountPage },
  admin: { title: 'Admin Dashboard', hint: 'People, invite codes, activity log', icon: 'gear', tint: 'var(--red)', Page: AdminPage, when: (c) => !!c.user?.admin },
  about: { title: 'About openKCal', hint: 'Version, install, openGym companion', icon: 'info', tint: 'var(--blue)', Page: AboutPage },
}

const GROUPS = [
  ['profile', 'opengym', 'welcome'],
  ['modules', 'units', 'look'],
  ['reminders', 'ai', 'integrations'],
  ['data', 'account', 'admin', 'about'],
]

export default function Settings({ page, setPage }) {
  const { modules } = useSettings()
  const { user, server } = useSync()

  const visible = (id) => {
    const p = PAGES[id]
    return (!p.mod || modules[p.mod]) && (!p.when || p.when({ user, server }))
  }

  if (page && PAGES[page] && visible(page)) {
    const { title, Page } = PAGES[page]
    return (
      <>
        <div className="hdr" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="iconbtn"
            onClick={() => setPage(null)}
            aria-label="Back to Settings"
          >
            <Icon name="chevronLeft" />
          </button>
          <div style={{ flex: 1, marginLeft: 12 }}>
            <h1 style={{ fontSize: 'var(--fs-title2)' }}>{title}</h1>
          </div>
        </div>
        <Page onExit={() => setPage(null)} />
      </>
    )
  }

  return (
    <>
      <div className="hdr">
        <div>
          <h1>Settings</h1>
          <p className="sub">Preferences, account & customization</p>
        </div>
      </div>

      {user && (
        <button
          type="button"
          className="card tappable"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, marginBottom: 16 }}
          onClick={() => setPage('account')}
        >
          <span className="lrow-i" style={{ '--tint': 'var(--acc)' }}>
            <Icon name="person" />
          </span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, display: 'block' }}>{user.name}</span>
            <span className="muted">{user.owner ? 'Server Owner' : user.admin ? 'Administrator' : 'Signed In'} · Manage Account</span>
          </div>
          <Icon name="chevronRight" className="lrow-c" />
        </button>
      )}

      {GROUPS.map((group, i) => {
        const ids = group.filter(visible)
        if (!ids.length) return null

        return (
          <div key={i} className="sect">
            <div className="sect-b">
              {ids.map((id) => {
                const item = PAGES[id]
                return (
                  <button
                    key={id}
                    type="button"
                    className="lrow tap"
                    onClick={() => setPage(id)}
                  >
                    <span className="lrow-i" style={{ '--tint': item.tint }}>
                      <Icon name={item.icon} />
                    </span>
                    <span className="lrow-m">
                      <span className="lrow-t">{item.title}</span>
                      <span className="lrow-s">{item.hint}</span>
                    </span>
                    <Icon name="chevronRight" className="lrow-c" />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}
