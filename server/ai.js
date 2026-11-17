// AI features on each person's own provider account. Nobody's calls are billed to the server owner:
// a person connects Anthropic, OpenAI, Google Gemini or an OpenAI-compatible endpoint (Ollama, LM
// Studio, OpenRouter...) in Settings -> AI, and their photo logging and weekly reviews run on it.
//
// Settings live in DATA_DIR/ai/<account id>.json (mode 0600), never in the synced state, so a key
// cannot ride along in a sync or an export. Keys are sealed with the instance secret, one per
// provider, so switching providers doesn't throw a key away. The browser never sees a key again.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { TOOLS, agentSystem, resolveProposal, searchResults } from '../src/lib/agent.js'
import { buildDish } from '../src/lib/dish.js'
import { HttpError, readJson, serialize, writeJson } from './http.js'
import { checkUrl, safeFetch, seal, unseal } from './secure.js'

// Defaults are starting points: "List models" in Settings asks the provider what it really serves.
// The OpenAI and Gemini names follow openGym's api/coach/core/providers.js.
export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', model: 'claude-opus-5-5', keyHint: 'sk-ant-…' },
  openai: { label: 'OpenAI', base: 'https://api.openai.com', model: 'gpt-5.6', keyHint: 'sk-…' },
  gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com', model: 'gemini-3.8-flash', keyHint: 'AIza…' },
  compatible: { label: 'OpenAI-compatible (Ollama, LM Studio, OpenRouter…)', model: null, keyHint: '(optional)', keyOptional: true },
}

// Request features only the current Claude models accept; older ones would answer 400.
const CLAUDE_CURRENT = /^claude-(fable-5|mythos-5|opus-5|sonnet-5-5|haiku-5-5)/
const CLAUDE_FALLBACK = /^claude-(fable-5-[12]|mythos-5-[12]|opus-5|sonnet-5-5)/

const Item = z.object({
  name: z.string(),
  grams: z.number(),
  kcal_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  sugar_per_100g: z.number(),
  fat_per_100g: z.number(),
  saturated_fat_per_100g: z.number(),
  fibre_per_100g: z.number(),
  sodium_mg_per_100g: z.number(),
})
const Meal = z.object({ items: z.array(Item) })

const LabelItem = z.object({
  name: z.string(),
  portionName: z.string().optional().default('serving'),
  portionGrams: z.number().optional().default(100),
  kcal_per_100g: z.number(),
  protein_per_100g: z.number(),
  carbs_per_100g: z.number(),
  sugar_per_100g: z.number().optional().default(0),
  fat_per_100g: z.number(),
  saturated_fat_per_100g: z.number().optional().default(0),
  fibre_per_100g: z.number().optional().default(0),
  sodium_mg_per_100g: z.number().optional().default(0),
})

const PHOTO_SYSTEM = `You estimate the contents of a meal from a photo for a food diary.
List each distinct food or dish you can see as one item: a short plain name, your best estimate of the
portion in grams as served, and typical nutrient values per 100 g for that food as prepared.
Indian home cooking is common here, so name dishes the way an Indian household would (roti, dal, sabzi).
The user reviews and corrects every item before it is saved, so give your single best estimate rather
than a range. If the photo shows no food, return an empty list.`

const JSON_SHAPE = `Answer with JSON only, no other text, in exactly this shape:
{"items":[{"name":"","grams":0,"kcal_per_100g":0,"protein_per_100g":0,"carbs_per_100g":0,"sugar_per_100g":0,"fat_per_100g":0,"saturated_fat_per_100g":0,"fibre_per_100g":0,"sodium_mg_per_100g":0}]}`

const LABEL_SYSTEM = `You parse nutrition facts labels and branded food packaging photos to create a verified food entry.
Given a photo of the nutrition label (and an optional photo of the entire product or packaging front), extract:
1. Product name and brand. If a front photo is present, use it for the exact brand name and product title.
2. Standard serving portion name (e.g. "1 bar", "1 cup", "1 bottle", "serving", "bowl") and portion weight in grams.
3. Nutrient values normalized per 100 g. If the label only lists values per serving, accurately calculate them per 100g using the serving size.
If the photo does not show a readable nutrition facts label or food product, return name "Custom Food" with 0 values.`

const LABEL_JSON_SHAPE = `Answer with JSON only, in exactly this shape:
{"name":"","portionName":"serving","portionGrams":100,"kcal_per_100g":0,"protein_per_100g":0,"carbs_per_100g":0,"sugar_per_100g":0,"fat_per_100g":0,"saturated_fat_per_100g":0,"fibre_per_100g":0,"sodium_mg_per_100g":0}`

const REVIEW_SYSTEM = `You are reviewing one week of a person's food diary against their own targets.
The data is JSON: daily totals, their targets, and weight change. Write for the person directly, in plain
text with no markdown. Say what went well, the one or two changes that would matter most, and a concrete
food suggestion for each. Keep it under 180 words. Days with nothing logged are missing data, not fasting.
This is general nutrition guidance, not medical advice; if the numbers suggest very low intake, say so
kindly and suggest speaking to a professional.`

const COACH_SYSTEM = `You are openKCal AI Nutrition Coach, an encouraging, scientifically grounded nutrition and dietary advisor.
Your recommendations should be:
- Practical, evidence-based, and macro-aware.
- Structured with clear bullet points and actionable portion advice.
- Considerate of wholesome whole foods, adequate protein, hydration, fiber, and healthy balance.
- Generic and globally applicable.
- Direct, warm, and concise without unnecessary fluff or lecturing.
- Short: answer in under 120 words, at most 3-4 bullets, no preamble or recap, unless the user asks for detail.
- Conversational: this is an ongoing chat. Read the conversation so far and answer the new message in that light; follow-ups like "what about dinner?" or "make it vegetarian" refer to what was just discussed. Answer any food, nutrition or fitness question directly, never with a generic overview.
When the user's daily context gives calorie or macro numbers, quote them exactly as given; never recompute or estimate your own.`

const MAX_ROUNDS = 10
const TOO_MANY = 'The model took too many steps. Try describing the meal more simply.'
// Consent covers a fixed list of what is sent; a new kind of data means asking again.
const CONSENT_VERSION = 2

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

// Model output is untrusted input: bound everything before it reaches a diary.
export const cleanItems = (items) =>
  items.slice(0, 12).map((i) => ({
    name: String(i.name).slice(0, 80),
    grams: Math.round(clamp(i.grams, 1, 2000)),
    per100: {
      kcal: clamp(i.kcal_per_100g, 0, 900),
      protein: clamp(i.protein_per_100g, 0, 100),
      carbs: clamp(i.carbs_per_100g, 0, 100),
      sugar: clamp(i.sugar_per_100g, 0, 100),
      fat: clamp(i.fat_per_100g, 0, 100),
      satFat: clamp(i.saturated_fat_per_100g, 0, 100),
      fibre: clamp(i.fibre_per_100g, 0, 100),
      sodium: clamp(i.sodium_mg_per_100g, 0, 40000),
    },
  }))

export const cleanLabelItem = (i) => ({
  name: String(i?.name || 'Custom Food').slice(0, 80),
  portions:
    i?.portionName && Number(i?.portionGrams) > 0
      ? [{ name: String(i.portionName).slice(0, 30), grams: Math.round(clamp(i.portionGrams, 1, 2000)) }]
      : [],
  per100: {
    kcal: clamp(i?.kcal_per_100g ?? 0, 0, 900),
    protein: clamp(i?.protein_per_100g ?? 0, 0, 100),
    carbs: clamp(i?.carbs_per_100g ?? 0, 0, 100),
    sugar: clamp(i?.sugar_per_100g ?? 0, 0, 100),
    fat: clamp(i?.fat_per_100g ?? 0, 0, 100),
    satFat: clamp(i?.saturated_fat_per_100g ?? 0, 0, 100),
    fibre: clamp(i?.fibre_per_100g ?? 0, 0, 100),
    sodium: clamp(i?.sodium_mg_per_100g ?? 0, 0, 40000),
  },
})

/** The JSON object in a model's text answer, tolerating code fences and chatter around it. */
export function parseJsonAnswer(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

class AiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'AiError'
    this.status = status
  }
}

// A base that already names its API version (OpenRouter's .../api/v1) is the whole prefix.
export const withVersion = (base, version, rest) => (/\/v\d+(?:beta\d*)?$/i.test(base) ? base : base + version) + rest

// What an error answer may say: the provider's own JSON message, never the raw body. A compatible
// endpoint is any URL a person types, and echoing bodies would let them read pages the server can reach.
async function failure(res, label) {
  let msg = ''
  try {
    const data = JSON.parse(await res.text())
    msg = data?.error?.message || data?.error || data?.message || ''
  } catch {
    /* not JSON: report the status only */
  }
  msg = typeof msg === 'string' ? msg.slice(0, 200) : ''
  if (res.status === 401 || res.status === 403) return new AiError(502, `${label} refused the API key. Check it in Settings → AI.`)
  if (res.status === 429) return new AiError(429, `${label} is rate-limiting this key. Try again shortly.`)
  if (res.status === 404 || (res.status === 400 && /model/i.test(msg)))
    return new AiError(502, `${label} does not offer that model${msg ? `: ${msg}` : ''}. Use “List models” in Settings → AI.`)
  return new AiError(502, `${label} failed (${res.status})${msg ? `: ${msg}` : ''}`)
}

async function send(url, opts, label) {
  let res
  try {
    res = await safeFetch(url, { timeout: 120_000, ...opts })
  } catch (e) {
    throw new AiError(502, e.code === 'EBLOCKED' ? e.message : `Could not reach ${label} (${e.code || e.message})`)
  }
  if (!res.ok) throw await failure(res, label)
  try {
    return JSON.parse(await res.text())
  } catch {
    throw new AiError(502, `${label} sent an answer that is not JSON`)
  }
}

// ---- one adapter per kind of provider: { text(job), models() } ----
// A job is { system, prompt, image?, json? }; text() returns the model's text answer.

function anthropicAdapter({ key, model }) {
  // authToken: null so a token in the server's own environment is never sent with someone's key.
  const client = new Anthropic({ apiKey: key, authToken: null, maxRetries: 2 })
  const current = CLAUDE_CURRENT.test(model)
  const call = async (fn) => {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
        throw new AiError(502, 'Anthropic refused the API key. Check it in Settings → AI.')
      if (e instanceof Anthropic.NotFoundError) throw new AiError(502, 'Anthropic does not offer that model. Use “List models” in Settings → AI.')
      if (e instanceof Anthropic.RateLimitError) throw new AiError(429, 'Anthropic is rate-limiting this key. Try again shortly.')
      if (e instanceof Anthropic.BadRequestError) throw new AiError(502, `Anthropic refused the request: ${String(e.message).slice(0, 200)}`)
      if (e instanceof Anthropic.APIError) throw new AiError(502, 'Anthropic failed. Try again.')
      throw new AiError(502, 'Could not reach Anthropic')
    }
  }
  const content = (job) => {
    const imgs = Array.isArray(job.images) ? job.images : job.image ? [job.image] : []
    return [
      ...imgs.map((img) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })),
      { type: 'text', text: job.prompt },
    ]
  }
  return {
    async meal(job) {
      const res = await call(() =>
        client.messages.parse({
          model,
          max_tokens: 16000,
          system: job.system,
          messages: [{ role: 'user', content: content(job) }],
          output_config: { ...(current && { effort: 'medium' }), format: zodOutputFormat(Meal) },
        }),
      )
      if (res.stop_reason === 'refusal' || !res.parsed_output) throw new AiError(422, 'The model could not read that photo')
      return res.parsed_output
    },
    async label(job) {
      const res = await call(() =>
        client.messages.parse({
          model,
          max_tokens: 16000,
          system: job.system,
          messages: [{ role: 'user', content: content(job) }],
          output_config: { ...(current && { effort: 'medium' }), format: zodOutputFormat(LabelItem) },
        }),
      )
      if (res.stop_reason === 'refusal' || !res.parsed_output) throw new AiError(422, 'The model could not read that label photo')
      return res.parsed_output
    },
    async text(job) {
      const fallback = CLAUDE_FALLBACK.test(model)
      const res = await call(() =>
        client.beta.messages.create({
          model,
          max_tokens: 16000,
          // If the model declines, the API retries on a fallback model in the same call.
          ...(fallback && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
          system: job.system,
          messages: [{ role: 'user', content: content(job) }],
          ...(current && { output_config: { effort: job.effort || 'medium' } }),
        }),
      )
      if (res.stop_reason === 'refusal') throw new AiError(422, 'The model declined to answer this one')
      return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    },
    async models() {
      const out = []
      for await (const m of await call(() => client.models.list({ limit: 100 }))) out.push(m.id)
      return out
    },
    // A tool loop: `run(name, input)` answers each tool call, or returns { final } to stop.
    async agent({ system, prompt, tools, run }) {
      const defs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }))
      const messages = [{ role: 'user', content: prompt }]
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await call(() =>
          client.messages.create({ model, max_tokens: 16000, system, tools: defs, messages, ...(current && { output_config: { effort: 'medium' } }) }),
        )
        if (res.stop_reason === 'refusal') throw new AiError(422, 'The model declined to answer this one')
        // The whole content goes back, thinking blocks included, as the API expects.
        messages.push({ role: 'assistant', content: res.content })
        const uses = res.content.filter((b) => b.type === 'tool_use')
        if (!uses.length) return { text: res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() }
        const results = []
        for (const u of uses) {
          const out = run(u.name, u.input)
          if (out?.final) return out
          results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) })
        }
        messages.push({ role: 'user', content: results })
      }
      throw new AiError(502, TOO_MANY)
    },
  }
}

function chatAdapter({ key, model, base, headers = {}, allowLan, label, openai }) {
  const url = (rest) => withVersion(base, '/v1', rest)
  const auth = { ...headers, ...(key && { authorization: `Bearer ${key}` }) }
  const run = async (job, json, jsonShape) => {
    const imgs = Array.isArray(job.images) ? job.images : job.image ? [job.image] : []
    const user = imgs.length
      ? [{ type: 'text', text: job.prompt }, ...imgs.map((img) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }))]
      : job.prompt
    const shape = jsonShape || JSON_SHAPE
    const payload = {
      model,
      messages: [
        { role: 'system', content: json ? `${job.system}\n\n${shape}` : job.system },
        { role: 'user', content: user },
      ],
      // OpenAI's current models want max_completion_tokens; most compatible servers only know max_tokens.
      [openai ? 'max_completion_tokens' : 'max_tokens']: 16000,
      ...(json && { response_format: { type: 'json_object' } }),
    }
    const opts = (p) => ({ method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(p), allowLan })
    let data
    try {
      data = await send(url('/chat/completions'), opts(payload), label)
    } catch (e) {
      // ponytail: one retry without JSON mode for servers that refuse response_format; openGym's
      // adapter has a longer ladder of request shapes if more endpoints turn out to need it.
      if (!json || !/response_format|json/i.test(e.message)) throw e
      delete payload.response_format
      data = await send(url('/chat/completions'), opts(payload), label)
    }
    const choice = data?.choices?.[0]
    if (choice?.finish_reason === 'length') throw new AiError(502, `${label} cut the answer off. Try a model with a larger output limit.`)
    return String(choice?.message?.content ?? '')
  }
  return {
    meal: async (job) => parseJsonAnswer(await run(job, true)),
    label: async (job) => parseJsonAnswer(await run(job, true, LABEL_JSON_SHAPE)),
    text: (job) => run(job, false).then((t) => t.trim()),
    async models() {
      const data = await send(url('/models'), { headers: auth, allowLan }, label)
      return (data?.data || []).map((m) => m.id).filter(Boolean).sort()
    },
    async agent({ system, prompt, tools, run }) {
      const defs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }))
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ]
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const data = await send(
          url('/chat/completions'),
          {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({ model, messages, tools: defs, [openai ? 'max_completion_tokens' : 'max_tokens']: 16000 }),
            allowLan,
          },
          label,
        )
        const msg = data?.choices?.[0]?.message
        if (!msg) throw new AiError(502, `${label} sent no answer`)
        messages.push(msg)
        const calls = msg.tool_calls || []
        if (!calls.length) return { text: String(msg.content || '').trim() }
        for (const c of calls) {
          let args = null
          try {
            args = JSON.parse(c.function?.arguments || '{}')
          } catch {
            /* answered below */
          }
          const out = args ? run(c.function?.name, args) : { error: 'The arguments were not valid JSON' }
          if (out?.final) return out
          messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out) })
        }
      }
      throw new AiError(502, TOO_MANY)
    },
  }
}

function geminiAdapter({ key, model, base }) {
  const label = 'Google Gemini'
  // The key goes in a header, never in ?key=, so it stays out of logs and error messages.
  const headers = { 'x-goog-api-key': key, 'content-type': 'application/json' }
  // Gemini 3+ thinks before answering by default; chat asks for little of it.
  // ponytail: 2.5 models take thinkingBudget instead, with per-model limits; left at their default.
  const thinking = (effort) => (effort === 'low' && /^gemini-([3-9]|\d\d)/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {})
  const run = async (job, json, jsonShape) => {
    const imgs = Array.isArray(job.images) ? job.images : job.image ? [job.image] : []
    const parts = [{ text: job.prompt }, ...imgs.map((img) => ({ inline_data: { mime_type: 'image/jpeg', data: img } }))]
    const shape = jsonShape || JSON_SHAPE
    const data = await send(
      `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: json ? `${job.system}\n\n${shape}` : job.system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: 16000, ...thinking(job.effort), ...(json && { responseMimeType: 'application/json' }) },
        }),
      },
      label,
    )
    const cand = data?.candidates?.[0]
    if (!cand) throw new AiError(422, `Gemini blocked the request${data?.promptFeedback?.blockReason ? `: ${data.promptFeedback.blockReason}` : ''}`)
    if (cand.finishReason === 'MAX_TOKENS') throw new AiError(502, 'Gemini cut the answer off')
    return (cand.content?.parts || []).map((p) => p.text || '').join('')
  }
  return {
    meal: async (job) => parseJsonAnswer(await run(job, true)),
    label: async (job) => parseJsonAnswer(await run(job, true, LABEL_JSON_SHAPE)),
    text: (job) => run(job, false).then((t) => t.trim()),
    async agent({ system, prompt, tools, run }) {
      const contents = [{ role: 'user', parts: [{ text: prompt }] }]
      const declarations = tools.map((t) => ({ name: t.name, description: t.description, parameters: t.schema }))
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const data = await send(
          `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents,
              tools: [{ functionDeclarations: declarations }],
              generationConfig: { maxOutputTokens: 16000 },
            }),
          },
          label,
        )
        const cand = data?.candidates?.[0]
        if (!cand?.content) throw new AiError(422, `Gemini blocked the request${data?.promptFeedback?.blockReason ? `: ${data.promptFeedback.blockReason}` : ''}`)
        contents.push(cand.content)
        const calls = (cand.content.parts || []).filter((p) => p.functionCall)
        if (!calls.length) return { text: (cand.content.parts || []).map((p) => p.text || '').join('').trim() }
        const responses = []
        for (const p of calls) {
          const out = run(p.functionCall.name, p.functionCall.args || {})
          if (out?.final) return out
          responses.push({ functionResponse: { name: p.functionCall.name, response: { result: out } } })
        }
        contents.push({ role: 'user', parts: responses })
      }
      throw new AiError(502, TOO_MANY)
    },
    async models() {
      const data = await send(`${base}/v1beta/models?pageSize=200`, { headers }, label)
      return (data?.models || [])
        .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => String(m.name).replace(/^models\//, ''))
    },
  }
}

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {Buffer} o.key  instance key from secure.instanceKey
 * @param {(uid: string) => boolean} o.allowLan  whether this person's endpoint may be on the server's network
 */
export async function createAi({ dataDir, key, allowLan = () => false }) {
  const dir = path.join(dataDir, 'ai')
  await mkdir(dir, { recursive: true })
  const file = (uid) => path.join(dir, `${uid}.json`)
  const writes = serialize()
  const load = (uid) => readJson(file(uid), { provider: null, models: {}, keys: {}, consent: {}, baseUrl: null, headers: null })
  const aad = (uid, provider) => `ai:${uid}:${provider}`

  function adapterFor(uid, cfg, provider = cfg.provider, overrides = {}) {
    const meta = PROVIDERS[provider]
    if (!meta) throw new AiError(400, 'Choose an AI provider in Settings → AI first')
    const apiKey = overrides.key ?? (cfg.keys[provider] ? unseal(key, cfg.keys[provider], aad(uid, provider)) : null)
    if (!apiKey && !meta.keyOptional) throw new AiError(400, `Add your ${meta.label} API key in Settings → AI`)
    const model = overrides.model ?? cfg.models[provider] ?? meta.model
    if (provider === 'anthropic') return anthropicAdapter({ key: apiKey, model })
    if (provider === 'gemini') return geminiAdapter({ key: apiKey, model, base: meta.base })
    const base = provider === 'openai' ? meta.base : (overrides.baseUrl ?? cfg.baseUrl)
    if (!base) throw new AiError(400, 'Add the endpoint address in Settings → AI')
    const label = provider === 'openai' ? 'OpenAI' : new URL(base).host
    return chatAdapter({ key: apiKey, model, base, headers: cfg.headers || {}, allowLan: allowLan(uid), label, openai: provider === 'openai' })
  }

  const consented = (cfg, p) => cfg.consent[p]?.v >= CONSENT_VERSION

  async function ready(uid) {
    const cfg = await load(uid)
    if (!cfg.provider) throw new AiError(400, 'Connect an AI provider in Settings → AI first')
    if (!consented(cfg, cfg.provider)) throw new AiError(400, 'Confirm what is sent to your AI provider in Settings → AI first')
    if (!cfg.models[cfg.provider] && !PROVIDERS[cfg.provider].model) throw new AiError(400, 'Pick a model in Settings → AI first')
    return { cfg, ai: adapterFor(uid, cfg) }
  }

  return {
    /** What Settings shows: never a key, only whether one is stored. */
    async config(uid) {
      const cfg = await load(uid)
      return {
        provider: cfg.provider,
        model: cfg.provider ? (cfg.models[cfg.provider] ?? PROVIDERS[cfg.provider].model) : null,
        baseUrl: cfg.baseUrl,
        headers: cfg.headers,
        hasKey: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, !!cfg.keys[p]])),
        consented: !!cfg.provider && consented(cfg, cfg.provider),
        providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, { label: p.label, model: p.model, keyHint: p.keyHint, keyOptional: !!p.keyOptional }])),
      }
    },

    async save(uid, b) {
      return writes(async () => {
        const cfg = await load(uid)
        const provider = b.provider
        if (!PROVIDERS[provider]) throw new HttpError(400, 'Unknown provider')
        cfg.provider = provider
        if (typeof b.model === 'string') cfg.models[provider] = b.model.trim().slice(0, 120) || undefined
        if (provider === 'compatible' && b.baseUrl !== undefined) {
          try {
            cfg.baseUrl = b.baseUrl ? checkUrl(b.baseUrl, { allowLan: allowLan(uid) }).toString().replace(/\/+$/, '') : null
          } catch (e) {
            throw new HttpError(400, e.message)
          }
        }
        if (b.headers !== undefined) cfg.headers = cleanHeaders(b.headers)
        if (typeof b.key === 'string' && b.key.trim()) cfg.keys[provider] = seal(key, b.key.trim(), aad(uid, provider))
        if (b.removeKey) delete cfg.keys[provider]
        if (b.consent === true) cfg.consent[provider] = { at: new Date().toISOString(), v: CONSENT_VERSION }
        await writeJson(file(uid), cfg, { private: true })
      })
    },

    /** Model names the provider serves, with the settings being typed (a key not saved yet works too). */
    async models(uid, b) {
      const cfg = await load(uid)
      let baseUrl
      if (b.provider === 'compatible' && b.baseUrl) {
        try {
          baseUrl = checkUrl(b.baseUrl, { allowLan: allowLan(uid) }).toString().replace(/\/+$/, '')
        } catch (e) {
          throw new HttpError(400, e.message)
        }
      }
      const ai = adapterFor(uid, cfg, b.provider, { key: b.key?.trim() || undefined, model: 'none', baseUrl })
      return { models: await ai.models() }
    },

    /** A real round trip with nothing personal in it. */
    async test(uid) {
      const cfg = await load(uid)
      const text = await adapterFor(uid, cfg).text({ system: 'You are a connection test.', prompt: 'Reply with the single word OK.', effort: 'low' })
      return { ok: true, reply: text.slice(0, 80) }
    },

    async forget(uid) {
      await writes(() => rm(file(uid), { force: true }))
    },

    /** base64 JPEG -> { items: [{ name, grams, per100 }], dish } */
    async photo(uid, image) {
      const { ai } = await ready(uid)
      const out = await ai.meal({ system: PHOTO_SYSTEM, prompt: 'What is on this plate?', image })
      const parsed = Meal.safeParse(out)
      if (!parsed.success) throw new AiError(502, 'The model answered in a shape openKCal could not read. Try again, or try another model.')
      const items = cleanItems(parsed.data.items)
      let dish = null
      if (items.length > 0) {
        const dishName = items.map((i) => i.name).slice(0, 3).join(' with ')
        const ingredients = items.map((i) => ({
          name: i.name,
          grams: i.grams,
          per100: i.per100,
        }))
        const built = buildDish({ name: dishName, ingredients, servings: 1 })
        dish = {
          name: dishName,
          servings: 1,
          ingredients,
          rawGrams: built.rawGrams,
          per100: built.per100,
          kind: 'dish',
        }
      }
      return { items, dish }
    },

    /** Parse nutrition label photo (+ optional package photo) -> { food } */
    async label(uid, { image, packageImage }) {
      const { ai } = await ready(uid)
      const images = [image, packageImage].filter(Boolean)
      if (!images.length) throw new AiError(400, 'Image required to parse nutrition label')
      const out = await ai.label({
        system: LABEL_SYSTEM,
        prompt: 'Parse the nutrition facts label and product name from this photo.',
        images,
      })
      const parsed = LabelItem.safeParse(out)
      return { food: cleanLabelItem(parsed.success ? parsed.data : out) }
    },

    /**
     * "I had two rotis and dal": the agent searches foods and proposes entries and new dishes.
     * Returns resolveProposal()'s shape; nothing is saved here, the person confirms in the app.
     */
    async describe(uid, { text, time, meal, foods, catalogue }) {
      const { ai } = await ready(uid)
      const all = [...foods, ...catalogue]
      const byId = new Map(all.map((f) => [f.id, f]))
      const out = await ai.agent({
        system: agentSystem({ time, meal }),
        prompt: text,
        tools: TOOLS,
        run: (name, input) => {
          if (name === 'search_foods') return { results: searchResults(all, input?.query) }
          if (name === 'propose_meal') return { final: input }
          return { error: `There is no tool called ${name}` }
        },
      })
      if (!out.final) return { entries: [], dishes: [], dropped: 0, message: out.text?.slice(0, 400) || 'Nothing was proposed. Try describing the meal again.' }
      return resolveProposal(out.final, (id) => byId.get(id), { time, meal })
    },

    /** week summary object -> { text } */
    async review(uid, summary) {
      const { ai } = await ready(uid)
      return { text: await ai.text({ system: REVIEW_SYSTEM, prompt: JSON.stringify(summary) }) }
    },

    /** prompt + optional context -> { text } */
    // history: earlier turns [{ role: 'user'|'coach', text }], oldest first, so follow-ups keep their meaning.
    async coach(uid, { prompt, context, history = [] }) {
      const { ai } = await ready(uid)
      const transcript = history.map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`).join('\n\n')
      const fullPrompt = [
        context && `User daily context:\n${context}`,
        transcript && `Conversation so far:\n${transcript}`,
        `User's new message:\n${prompt}`,
      ]
        .filter(Boolean)
        .join('\n\n')
      // Chat should feel instant: low effort means little thinking before the reply.
      return { text: await ai.text({ system: COACH_SYSTEM, prompt: fullPrompt, effort: 'low' }) }
    },
  }
}

// Extra headers some gateways want (routing, attribution). Never anything that would override
// authentication or transport. Same caps as openGym's providers.js.
const RESERVED = new Set(['authorization', 'proxy-authorization', 'content-type', 'content-length', 'host', 'connection', 'transfer-encoding', 'upgrade', 'cookie', 'x-api-key', 'x-goog-api-key'])
export function cleanHeaders(raw) {
  if (raw == null || raw === '') return null
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'Extra headers: name to value')
  const entries = Object.entries(raw)
  if (entries.length > 8) throw new HttpError(400, 'At most 8 extra headers')
  const out = {}
  for (const [name, value] of entries) {
    const n = name.trim().toLowerCase()
    if (!/^[!#$%&'*+\-.^_`|~0-9a-z]{1,64}$/.test(n)) throw new HttpError(400, `Bad header name: ${name}`)
    if (RESERVED.has(n)) throw new HttpError(400, `That header is set by openKCal itself: ${name}`)
    if (typeof value !== 'string' || !value.trim() || value.length > 500 || /[\r\n]/.test(value)) throw new HttpError(400, `Header ${name} needs a short value`)
    out[n] = value.trim()
  }
  return Object.keys(out).length ? out : null
}
