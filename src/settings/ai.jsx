import { useEffect, useState } from 'react'
import { call } from '../api'
import { refreshMe, useSync } from '../sync'

// Headers typed as "Name: value" lines <-> the object the server stores.
const headersToText = (h) => Object.entries(h || {}).map(([k, v]) => `${k}: ${v}`).join('\n')
function textToHeaders(t) {
  const out = {}
  for (const line of t.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const i = line.indexOf(':')
    if (i < 1) throw new Error(`“${line}” is not “Name: value”`)
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

// Settings → AI: every AI feature runs on the person's own provider account and key.
export function AiPage() {
  const user = useSync((s) => s.user)
  const [cfg, setCfg] = useState(null)
  const [provider, setProvider] = useState(null)
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [headers, setHeaders] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState(null)
  const [consent, setConsent] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (c) => {
    setCfg(c)
    setProvider(c.provider || 'anthropic')
    setModel(c.model || c.providers[c.provider || 'anthropic'].model || '')
    setBaseUrl(c.baseUrl || '')
    setHeaders(headersToText(c.headers))
    setConsent(c.consented)
  }
  useEffect(() => {
    if (user) call('GET', '/api/ai').then(load, (e) => setMsg(e.message))
  }, [user])

  if (!user) return <section className="card"><p className="muted">Sign in (Settings → Account) to use AI features: they run through your Thally server on your own AI provider.</p></section>
  if (!cfg) return <section className="card"><p className="muted">{msg || 'Loading…'}</p></section>

  const meta = cfg.providers[provider]
  const act = async (fn) => {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }
  const save = () =>
    act(async () => {
      const c = await call('POST', '/api/ai', {
        provider,
        model,
        ...(provider === 'compatible' && { baseUrl, headers: textToHeaders(headers) }),
        ...(key && { key }),
        consent,
      })
      setKey('')
      load(c)
      await refreshMe()
      setMsg(c.consented ? 'Saved.' : 'Saved. Tick the box about what is sent to turn AI on.')
    })

  return (
    <>
      <section className="card">
        <p className="muted">
          Logging meals by voice or text, photo logging and the weekly review run on <strong>your own</strong> AI provider account: you bring the key, and your usage is billed to you, not to
          whoever runs this server. The key is stored encrypted on the server and never shown again.
        </p>
        <fieldset className="choice">
          <legend>Provider</legend>
          {Object.entries(cfg.providers).map(([id, p]) => (
            <label key={id}>
              <input
                type="radio"
                name="provider"
                checked={provider === id}
                onChange={() => {
                  setProvider(id)
                  setModels(null)
                  setModel(id === cfg.provider ? cfg.model || '' : p.model || '')
                  setConsent(id === cfg.provider && cfg.consented)
                }}
              />{' '}
              {p.label} {cfg.hasKey[id] && <small>· key saved</small>}
            </label>
          ))}
        </fieldset>

        {provider === 'compatible' && (
          <>
            <label>
              Endpoint
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1 or http://localhost:11434" inputMode="url" />
            </label>
            <p className="muted">Ollama, LM Studio, vLLM, OpenRouter or any server that speaks the OpenAI chat format. Addresses on the server’s own network work for admins, and for everyone when the server allows it.</p>
          </>
        )}

        <label>
          API key {meta.keyOptional && <small>(optional)</small>}
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={cfg.hasKey[provider] ? 'Saved. Paste a new one to replace it.' : meta.keyHint}
            autoComplete="off"
          />
        </label>

        <label>
          Model
          {models ? (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {!models.includes(model) && model && <option value={model}>{model}</option>}
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={meta.model || 'Use List models'} />
          )}
        </label>
        <div className="actions start">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() =>
              act(async () => {
                const r = await call('POST', '/api/ai/models', { provider, ...(key && { key }), ...(provider === 'compatible' && { baseUrl }) })
                setModels(r.models)
                if (!model && r.models[0]) setModel(r.models[0])
                setMsg(`${r.models.length} models available.`)
              })
            }
          >
            List models
          </button>
        </div>

        {provider === 'compatible' && (
          <details>
            <summary>Extra headers (rarely needed)</summary>
            <label>
              One “Name: value” per line, for gateways that want them
              <textarea rows="3" value={headers} onChange={(e) => setHeaders(e.target.value)} />
            </label>
          </details>
        )}

        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I understand that, when I use them, these go to {meta.label.split(' (')[0]}: what I say or type to log a meal, with the names and nutrients of
            my own foods and dishes it searches; the meal photos I take for photo logging; and for a weekly review my daily totals, my targets and my weight
            change for those seven days. Nothing else, and never in the background.
          </span>
        </label>

        <div className="actions">
          <button type="button" disabled={busy} onClick={save}>
            Save
          </button>
        </div>
        {msg && <p role="status">{msg}</p>}
      </section>

      {cfg.provider && (
        <section className="card">
          <p className="muted">
            Using <strong>{cfg.providers[cfg.provider].label}</strong>, model {cfg.model || '(none picked)'}. {cfg.consented ? 'On.' : 'Off until you tick the box above.'}
          </p>
          <div className="actions start">
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await call('POST', '/api/ai/test', {})
                  setMsg(`It works. The model said: “${r.reply}”`)
                })
              }
            >
              Test the connection
            </button>
            <button
              type="button"
              className="ghost danger"
              disabled={busy}
              onClick={() =>
                confirm('Remove every AI key and setting from the server?') &&
                act(async () => {
                  load(await call('POST', '/api/ai/forget', {}))
                  await refreshMe()
                  setMsg('Removed.')
                })
              }
            >
              Remove my AI settings
            </button>
          </div>
        </section>
      )}
    </>
  )
}
