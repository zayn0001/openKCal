import { useRef, useState, useEffect } from 'react'
import Icon from '../components/Icon'
import LabelScanner from '../components/LabelScanner'
import PhotoLog from '../PhotoLog'
import { scale, sum } from '../lib/nutrition'
import { today, useStore } from '../store'
import { useUI } from '../store/useUI'
import { api, useSync } from '../sync'

const QUICK_PROMPTS = [
  'What should I eat for dinner with my remaining calories?',
  'Suggest high-protein vegetarian Indian foods',
  'Healthy Indian swaps for naan and white rice',
  'How to reduce bloating and water retention?',
]

function getLocalAdvice(prompt, eaten, remaining) {
  const q = prompt.toLowerCase()
  if (q.includes('dinner') || q.includes('remaining') || q.includes('eat')) {
    return `Based on your diary today, you have approximately ${Math.max(0, remaining)} kcal left. Here are 3 balanced meal options:
1. **Grilled Chicken & Roasted Sweet Potato**: 150g chicken breast with herbs, baked sweet potato, and steamed greens (~360 kcal, 38g protein).
2. **Salmon & Quinoa Salad Bowl**: 120g grilled salmon with fluffy quinoa, baby spinach, and olive oil dressing (~390 kcal, 30g protein).
3. **Tofu / Egg Scramble with Whole-Grain Toast**: 2 eggs or 150g firm tofu with mushrooms, spinach, and a slice of sourdough (~310 kcal, 22g protein).`
  }
  if (q.includes('protein') || q.includes('sources') || q.includes('vegetarian')) {
    return `Top lean protein sources per 100g:
• **Chicken Breast / Turkey**: 31g protein (lean & high biological value)
• **Tuna / Salmon / White Fish**: 24-26g protein + omega-3 fatty acids
• **Greek Yogurt / Cottage Cheese**: 11-14g protein (rich in casein)
• **Eggs & Egg Whites**: 13g protein
• **Tofu / Tempeh / Edamame**: 12-19g plant protein
• **Whey Isolate / Plant Protein**: 24-27g protein per scoop`
  }
  if (q.includes('swap') || q.includes('snack') || q.includes('rice') || q.includes('carbs')) {
    return `Smart nutritional swaps:
• **Refined White Bread / Bagels** ➔ **100% Whole-Grain, Sourdough, or Sprouted Grain Bread**
• **Sugary Soda / Juices** ➔ **Sparkling water with lemon & fresh mint**
• **Deep Fried Potato Chips** ➔ **Air-popped popcorn or roasted chickpeas**
• **Ice Cream (280 kcal)** ➔ **Frozen berries blended with high-protein Greek yogurt (140 kcal)**`
  }
  return `Great question! Prioritize hitting 1.6–2.0g protein per kg of bodyweight, drink at least 2.5–3 liters of water, and keep fiber above 25g daily. Let me know if you want recipe ideas or macro adjustments for any specific dish!`
}

export default function CoachChat() {
  const coachChat = useStore((s) => s.coachChat) || []
  const profile = useStore((s) => s.profile)
  const diary = useStore((s) => s.diary[today()]) || []
  const { addCoachMessage, clearCoachChat, addEntry } = useStore.getState()
  const { toast } = useUI.getState()
  const user = useSync((s) => s.user)
  const aiReady = !!user?.ai?.ready

  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [photoLogging, setPhotoLogging] = useState(false)
  const [labelScanning, setLabelScanning] = useState(false)
  const endRef = useRef(null)

  const eaten = sum(diary)
  const targetKcal = profile?.goal === 'lose' ? 1700 : 2100
  const remaining = targetKcal - Math.round(eaten.kcal || 0)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [coachChat, busy])

  const send = async (textToSend) => {
    const text = (textToSend || input).trim()
    if (!text || busy) return
    setInput('')

    addCoachMessage({ role: 'user', text })
    setBusy(true)

    try {
      if (aiReady) {
        const r = await api('POST', '/api/ai/describe', {
          prompt: `You are openKCal AI Nutritionist, a helpful nutrition expert like HealthifyMe Ria. 
User query: ${text}. 
Current user state: Eaten ${Math.round(eaten.kcal)} kcal, Protein ${Math.round(eaten.protein)}g, Remaining ${remaining} kcal.
Provide a concise, encouraging, bullet-pointed response focused on wholesome nutrition and Indian dietary options.`,
        }).catch(() => null)

        if (r?.ok && r.body?.text) {
          addCoachMessage({ role: 'coach', text: r.body.text })
          setBusy(false)
          return
        }
      }

      // Smart local fallback advice
      setTimeout(() => {
        const reply = getLocalAdvice(text, eaten, remaining)
        addCoachMessage({ role: 'coach', text: reply })
        setBusy(false)
      }, 600)
    } catch {
      addCoachMessage({ role: 'coach', text: getLocalAdvice(text, eaten, remaining) })
      setBusy(false)
    }
  }

  const handlePhotoMealAdded = (items) => {
    for (const it of items) {
      addEntry(today(), {
        meal: 'Lunch',
        name: it.name,
        grams: it.grams,
        ...(it.foodId && { foodId: it.foodId }),
        ...scale(it.per100, it.grams),
      })
    }
    toast(`Logged ${items.length} item${items.length === 1 ? '' : 's'} to Lunch`)
    addCoachMessage({
      role: 'coach',
      text: `📸 Successfully analyzed your plate and logged ${items.length} item${items.length === 1 ? '' : 's'} (${items.map((i) => i.name).join(', ')}) to today's Lunch!`,
    })
    setPhotoLogging(false)
  }

  const handleDishCreated = (dish) => {
    addEntry(today(), {
      meal: 'Lunch',
      name: dish.name,
      grams: dish.rawGrams,
      foodId: dish.id,
      ...scale(dish.per100, dish.rawGrams),
    })
    toast(`Created recipe "${dish.name}" & logged to Lunch`)
    addCoachMessage({
      role: 'coach',
      text: `🍲 Created recipe dish **${dish.name}** with ${dish.ingredients?.length || 0} ingredients! It is now shared in the community library for all users and logged to your diary.`,
    })
    setPhotoLogging(false)
  }

  const handleLabelSaved = (food) => {
    addCoachMessage({
      role: 'coach',
      text: `🏷️ Parsed nutrition facts for **${food.name}** (${Math.round(food.per100?.kcal || 0)} kcal, ${food.per100?.protein || 0}g protein per 100g). Saved to the global food database for everyone!`,
    })
  }

  return (
    <>
      <div className="hdr">
        <div>
          <h1>AI Nutrition Coach</h1>
          <p className="sub">Personalized meal advice, photo dish creation & label OCR</p>
        </div>
        {coachChat.length > 0 && (
          <button
            type="button"
            className="iconbtn"
            onClick={clearCoachChat}
            aria-label="Clear chat"
          >
            <Icon name="trash" />
          </button>
        )}
      </div>

      <div className="coach-chat-wrap">
        {/* Welcome greeting */}
        <div className="chat-msg coach">
          <p style={{ margin: 0, fontWeight: 600 }}>Hello! I'm your openKCal AI Coach</p>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-subhead)' }}>
            Ask me for recipe ideas with your remaining calories, protein sources, or use the camera and label scanner tools below to analyze your food directly!
          </p>
        </div>

        {/* AI Skill Tools */}
        <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="chip on"
            onClick={() => setPhotoLogging(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="camera" /> Photo Food → AI Dish
          </button>
          <button
            type="button"
            className="chip on"
            onClick={() => setLabelScanning(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="barcode" /> Scan Label (OCR)
          </button>
        </div>

        {/* Quick prompt suggestions */}
        {coachChat.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
            <span className="sect-t">Quick Questions</span>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="card tappable"
                style={{ padding: '10px 14px', textAlign: 'start', margin: 0 }}
                onClick={() => send(p)}
              >
                <span style={{ fontSize: 'var(--fs-subhead)' }}>{p}</span>
              </button>
            ))}
          </div>
        )}

        {/* Message history */}
        {coachChat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
          </div>
        ))}

        {busy && (
          <div className="chat-msg coach">
            <span className="muted">Thinking & formulating recommendations…</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Floating Chat Input Bar */}
      <form
        className="chat-input-bar"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          className="iconbtn"
          onClick={() => setPhotoLogging(true)}
          title="Click photo of food to create dish / log"
          aria-label="Click photo of food"
        >
          <Icon name="camera" />
        </button>

        <button
          type="button"
          className="iconbtn"
          onClick={() => setLabelScanning(true)}
          title="Scan nutrition facts label from package"
          aria-label="Scan nutrition facts label"
        >
          <Icon name="barcode" />
        </button>

        <input
          type="text"
          className="field"
          placeholder="Ask coach or describe a meal…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="iconbtn on-ss"
          disabled={!input.trim() || busy}
          aria-label="Send message"
        >
          <Icon name="play" />
        </button>
      </form>

      {photoLogging && (
        <PhotoLog
          title="AI Photo Meal Recognition"
          onClose={() => setPhotoLogging(false)}
          onAdd={handlePhotoMealAdded}
          onAddDish={handleDishCreated}
        />
      )}

      {labelScanning && (
        <LabelScanner
          onClose={() => setLabelScanning(false)}
          onSaved={handleLabelSaved}
          defaultMeal="Lunch"
        />
      )}
    </>
  )
}
