import { AccountPage } from '../settings/account'
import { AdminPage } from '../settings/admin'
import { AiPage } from '../settings/ai'
import { AboutPage, LookPage, ModulesPage, ProfilePage, UnitsPage } from '../settings/basic'
import { DataPage } from '../settings/data'
import { IntegrationsPage } from '../settings/integrations'
import { RemindersPage } from '../settings/reminders'
import { useSettings } from '../store'
import { useSync } from '../sync'

// Settings, page by page as in openGym. `mod`: the module a page belongs to; with it off the
// page is gone. `when`: who sees it.
const PAGES = {
  profile: { title: 'Profile & targets', hint: 'Body, activity and goal', Page: ProfilePage },
  modules: { title: 'Modules', hint: 'Switch parts of Thally on and off', Page: ModulesPage },
  units: { title: 'Units', hint: 'kcal or kJ, kg or lb, cm or inches', Page: UnitsPage },
  look: { title: 'Look', hint: 'Theme and accent colour', Page: LookPage },
  reminders: { title: 'Reminders', hint: 'Meal reminders by notification', Page: RemindersPage, mod: 'reminders', when: (c) => !!c.server },
  ai: { title: 'AI', hint: 'Your own AI provider for photo logging and reviews', Page: AiPage, mod: 'ai', when: (c) => !!c.server },
  integrations: { title: 'Integrations', hint: 'Webhooks to Home Assistant, n8n, ntfy…', Page: IntegrationsPage, mod: 'webhooks', when: (c) => !!c.server },
  data: { title: 'Data & backup', hint: 'Export, import, spreadsheets, reset', Page: DataPage },
  account: { title: 'Account', hint: 'Sign-in, passkeys, devices', Page: AccountPage },
  admin: { title: 'Admin dashboard', hint: 'People, invite codes, activity log', Page: AdminPage, when: (c) => !!c.user?.admin },
  about: { title: 'About', hint: 'Version, install, data sources', Page: AboutPage },
}
const GROUPS = [['profile'], ['modules', 'units', 'look'], ['reminders', 'ai', 'integrations'], ['data', 'account', 'admin', 'about']]

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
        <nav className="subhead">
          <button type="button" className="ghost" onClick={() => setPage(null)} aria-label="Back to settings">
            ‹ Settings
          </button>
          <h2>{title}</h2>
        </nav>
        <Page />
      </>
    )
  }

  return (
    <>
      {user && (
        <button type="button" className="card account-card" onClick={() => setPage('account')}>
          <strong>{user.name}</strong>
          <small>{user.owner ? 'Owner of this server' : user.admin ? 'Admin' : 'Signed in'} · Account</small>
        </button>
      )}
      {GROUPS.map((group, i) => {
        const ids = group.filter(visible)
        return (
          ids.length > 0 && (
            <ul key={i} className="list card menu">
              {ids.map((id) => (
                <li key={id}>
                  <button type="button" className="row" onClick={() => setPage(id)}>
                    <span>
                      {PAGES[id].title}
                      <small>{PAGES[id].hint}</small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )
      })}
    </>
  )
}
