// Optional AI features, on when the server has an Anthropic key.
// The key stays on the server; browsers never see it.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5'

const Meal = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      grams: z.number(),
      kcal_per_100g: z.number(),
      protein_per_100g: z.number(),
      carbs_per_100g: z.number(),
      fat_per_100g: z.number(),
      fibre_per_100g: z.number(),
    }),
  ),
})

const PHOTO_SYSTEM = `You estimate the contents of a meal from a photo for a food diary.
List each distinct food or dish you can see as one item: a short plain name, your best estimate of the
portion in grams as served, and typical nutrient values per 100 g for that food as prepared.
Indian home cooking is common here, so name dishes the way an Indian household would (roti, dal, sabzi).
The user reviews and corrects every item before it is saved, so give your single best estimate rather
than a range. If the photo shows no food, return an empty list.`

const REVIEW_SYSTEM = `You are reviewing one week of a person's food diary against their own targets.
The data is JSON: daily totals, their targets, and weight change. Write for the person directly, in plain
text with no markdown. Say what went well, the one or two changes that would matter most, and a concrete
food suggestion for each. Keep it under 180 words. Days with nothing logged are missing data, not fasting.
This is general nutrition guidance, not medical advice; if the numbers suggest very low intake, say so
kindly and suggest speaking to a professional.`

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
      fat: clamp(i.fat_per_100g, 0, 100),
      fibre: clamp(i.fibre_per_100g, 0, 100),
    },
  }))

class AiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'AiError'
    this.status = status
  }
}

// Turn SDK failures into something the browser can show.
async function call(fn) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError(502, 'The server’s AI key was rejected')
    if (e instanceof Anthropic.RateLimitError) throw new AiError(429, 'The AI service is busy. Try again shortly.')
    if (e instanceof Anthropic.APIError) throw new AiError(502, 'The AI service failed. Try again.')
    throw e
  }
}

export function createAi() {
  const client = new Anthropic() // key from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN

  return {
    // base64 JPEG -> { items: [{ name, grams, per100 }] }
    async photo(image) {
      const res = await call(() =>
        client.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          system: PHOTO_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
                { type: 'text', text: 'What is on this plate?' },
              ],
            },
          ],
          output_config: { effort: 'medium', format: zodOutputFormat(Meal) },
        }),
      )
      if (res.stop_reason === 'refusal' || !res.parsed_output) throw new AiError(422, 'Could not read that photo')
      return { items: cleanItems(res.parsed_output.items) }
    },

    // week summary object -> { text }
    async review(summary) {
      const res = await call(() =>
        client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          // If the model declines, the API retries on a fallback model in the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: REVIEW_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(summary) }],
          output_config: { effort: 'medium' },
        }),
      )
      if (res.stop_reason === 'refusal') throw new AiError(422, 'No review available for this week')
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      return { text }
    },
  }
}
