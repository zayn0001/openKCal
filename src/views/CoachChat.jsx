import { useRef, useState, useEffect } from 'react'
import Icon from '../components/Icon'
import LabelScanner from '../components/LabelScanner'
import Markdown from '../components/Markdown'
import PhotoLog from '../PhotoLog'
import { scale, sum } from '../lib/nutrition'
import { remainingKcal } from '../lib/targets'
import { dayTargets, today, useStore } from '../store'
import { useUI } from '../store/useUI'
import { api, useSync } from '../sync'

const QUICK_PROMPTS = [
  'What should I eat with my remaining calories today?',
  'High-protein snack ideas under 200 kcal',
  'Healthy macro-friendly swaps for everyday foods',
  'How to reduce bloating and optimize hydration',
]

function getLocalAdvice(prompt, eaten, remaining, _profile) {
  const q = prompt.toLowerCase()
  const kcalLogged = Math.round(eaten?.kcal || 0)
  const proteinLogged = Math.round(eaten?.protein || 0)
  const carbsLogged = Math.round(eaten?.carbs || 0)
  const fatLogged = Math.round(eaten?.fat || 0)
  const rem = Math.max(0, remaining)

  // 1. Casual Greetings & Hello
  if (/\b(hi|hello|hey|yo|howdy|good\s*morning|good\s*afternoon|good\s*evening|greetings|how\s*are\s*you|who\s*are\s*you|what\s*can\s*you\s*do|help)\b/i.test(q)) {
    return `Hello! 👋 I'm your openKCal nutrition coach.

Here is your snapshot for today:
• **Logged**: ${kcalLogged} kcal (${proteinLogged}g protein, ${carbsLogged}g carbs, ${fatLogged}g fat)
• **Remaining**: ${rem} kcal towards your daily goal

How can I help you right now?
• Ask **"What should I eat with my remaining calories?"** for meal options that fit your budget
• Ask **"How to hit my protein goal?"** for lean high-protein sources
• Ask **"How to reduce bloating?"** for rapid digestion & fluid balance tips
• Ask **"Healthy snack swaps"** for macro-friendly alternatives
• Or tap **Photo Food → AI Dish** or **Scan Label (OCR)** to log foods with your camera!`
  }

  // 2. Bloating & Water Retention & Digestion
  if (/\b(bloat|bloating|water retention|puffy|puffiness|stomach|gas|digest|digestion|retention)\b/i.test(q)) {
    return `Here is a science-backed protocol to rapidly reduce bloating and water retention:

1. **Hydrate Consistently (2.5–3.5 L/day)**: When under-hydrated, your body holds onto subcutaneous water. Drinking plenty of water signals kidneys to release excess sodium and fluids.
2. **Balance Sodium with Potassium**: Excess salt causes fluid retention. Counteract it with potassium-rich whole foods like bananas, spinach, avocado, tomatoes, and coconut water.
3. **Take a 10–15 Min Post-Meal Walk**: Light movement stimulates gastric motility, helping food move through your GI tract and preventing trapped gas.
4. **Watch Carbonation & Sugar Alcohols**: Carbonated drinks and artificial sweeteners (maltitol, sorbitol, erythritol) can cause significant bloating.
5. **Soothing Herbal Teas**: Peppermint, ginger, or chamomile tea after meals naturally relax digestive tract muscles.`
  }

  // 3. Dinner / Lunch / Breakfast / Snacks & Remaining Calories
  if (/\b(dinner|lunch|breakfast|snack|snacks|remaining|what (should|can) i eat|what to eat|meal idea|hungry)\b/i.test(q)) {
    if (rem <= 250) {
      return `You have approximately **${rem} kcal remaining** today. Here are light, satiating options to close your day:

• **High-Protein Greek Yogurt Bowl** (~130 kcal): 150g non-fat Greek yogurt with a handful of fresh blueberries (17g protein).
• **Cottage Cheese & Cucumber Slices** (~110 kcal): 100g low-fat cottage cheese seasoned with black pepper and herbs (12g protein).
• **Hard-Boiled Egg & Warm Herbal Tea** (~75 kcal): 1 large egg with sea salt and peppermint tea (6g protein).
• **Air-Popped Sea Salt Popcorn** (~95 kcal): 3 cups of air-popped popcorn for high-volume crunch.`
    }
    if (rem <= 550) {
      return `You have **${rem} kcal remaining** today—plenty for a satisfying, nutrient-dense meal:

1. **Grilled Chicken Breast with Sweet Potato & Greens** (~420 kcal, 38g protein)
   • 150g grilled chicken breast with rosemary & garlic
   • 120g baked sweet potato
   • 150g steamed broccoli or asparagus
2. **Pan-Seared Salmon & Crisp Mediterranean Salad** (~440 kcal, 32g protein)
   • 130g wild salmon fillet
   • 2 cups mixed baby greens, cucumbers, cherry tomatoes, and 1 tsp olive oil vinaigrette
3. **Tofu & Edamame Quinoa Bowl** (~390 kcal, 26g plant protein)
   • 140g firm tofu cubes pan-seared with low-sodium soy sauce
   • 60g shelled edamame, 80g cooked quinoa, and fresh baby spinach`
    }
    return `You have **${rem} kcal remaining** today—a generous budget for a hearty, wholesome meal:

1. **Lean Steak / Sirloin with Roasted Potatoes** (~580 kcal, 44g protein)
   • 170g lean steak or 93% lean ground turkey
   • 180g herb-roasted red potatoes
   • 120g grilled asparagus or green beans
2. **Loaded Chicken Rice & Avocado Bowl** (~560 kcal, 42g protein)
   • 160g seasoned grilled chicken breast
   • 120g cooked jasmine or brown rice
   • 40g fresh avocado slices and roasted bell peppers
3. **Warm Chickpea & Grilled Halloumi Plate** (~510 kcal, 26g protein)
   • 150g spiced warm chickpeas
   • 60g grilled halloumi or feta
   • Diced cucumber, cherry tomatoes, and a toasted whole-wheat pita`
  }

  // 4. Protein Sources & Muscle
  if (/\b(protein|lean meat|sources|vegetarian protein|vegan protein|hit protein|whey|amino|muscle|bulk)\b/i.test(q)) {
    return `Top lean protein sources to hit your daily targets (protein per 100g):

**Lean Animal Sources:**
• **Chicken / Turkey Breast**: ~31g protein (ultra-lean & versatile)
• **Canned Tuna (in spring water)**: ~26g protein
• **Wild Salmon / Cod / White Fish**: ~20–25g protein + healthy omega-3s
• **Egg Whites & Whole Eggs**: ~11g per 100g (~6–7g per whole large egg)

**Dairy & Plant Sources:**
• **0% Non-Fat Greek Yogurt**: ~10–12g protein (rich in slow-digesting casein)
• **Low-Fat Cottage Cheese**: ~11–13g protein
• **Firm Tofu & Tempeh**: ~12–19g plant protein
• **Edamame & Lentils**: ~9–12g protein
• **Whey / Plant Isolate Powder**: ~24–27g protein per scoop

💡 *Tip*: Distribute protein across 3–4 meals (aiming for 25–40g each) to optimize muscle protein synthesis throughout the day.`
  }

  // 5. Healthy Swaps & Cravings
  if (/\b(swap|swaps|craving|cravings|junk|sweet|sugar|chips|ice cream|soda|bread|snack)\b/i.test(q)) {
    return `Smart, macro-friendly food swaps that satisfy cravings while saving hundreds of calories:

• **Potato Chips (150 kcal / oz)** ➔ **Air-popped popcorn** (30 kcal / cup) or **roasted sea-salt edamame** (high fiber + 14g protein).
• **Sugary Soda / Sweet Juice (150 kcal)** ➔ **Sparkling water with fresh lime, lemon & mint** (0 kcal).
• **Regular Ice Cream (280 kcal)** ➔ **Frozen banana blended with 1 scoop protein powder & splash of almond milk** (140 kcal, 22g protein "nice cream").
• **Creamy Mayonnaise / Ranch (140 kcal / tbsp)** ➔ **Non-fat Greek yogurt mixed with Dijon mustard, lemon, and garlic** (25 kcal).
• **Refined White Bread** ➔ **100% Sprouted Whole-Grain or Sourdough Bread** (lower glycemic spike, sustained energy, higher micronutrients).`
  }

  // 6. Fat Loss & Cutting
  if (/\b(lose weight|fat loss|cut|cutting|deficit|burn fat|scale|weight loss|lose fat)\b/i.test(q)) {
    return `Core principles for sustainable fat loss:

1. **Target a Moderate Deficit**: A 300–500 kcal deficit below your maintenance TDEE is optimal (roughly 0.25–0.5 kg of fat loss per week). Avoid crash dieting which burns muscle and lowers metabolic rate.
2. **Prioritize Protein (1.6–2.2g per kg)**: Preserves lean muscle, keeps you satiated, and has the highest thermic effect of food (TEF).
3. **Volume Eating**: Fill half your plate with leafy greens and fibrous vegetables (cucumber, zucchini, peppers) to fill your stomach on minimal calories.
4. **Daily Step Count (NEAT)**: Aim for 8,000–10,000 steps daily. Non-exercise activity burns more total calories over a week than isolated gym sessions.
5. **Track Accurately**: Cooking oils, dressings, and liquid calories add up quickly—log them diligently.`
  }

  // 7. Workouts & Exercise Nutrition
  if (/\b(workout|gym|exercise|pre-workout|post-workout|training|lifting)\b/i.test(q)) {
    return `Optimal workout nutrition guidelines:

**Pre-Workout (30–60 minutes before):**
• Focus on easily digestible carbohydrates with moderate protein and low fat to prevent sluggish digestion.
• *Ideas*: 1 banana with 1 tbsp peanut butter, a rice cake with honey, or oatmeal with half a scoop of whey.

**Post-Workout (within 1–2 hours):**
• Replenish muscle glycogen and kickstart protein synthesis with 25–35g of quality protein and 30–50g of carbohydrates.
• *Ideas*: Whey protein shake with an apple, chicken breast with jasmine rice, or Greek yogurt with berries and granola.

**Hydration**: Drink 500ml of water before training and sip electrolytes during intense sweating.`
  }

  // 8. Intermittent Fasting
  if (/\b(fast|fasting|intermittent|16:8|eating window)\b/i.test(q)) {
    return `Tips for successful intermittent fasting (e.g. 16:8):

1. **During the Fasting Window**: Stick to water, black coffee, or plain herbal tea. Avoid sweeteners if they trigger hunger or insulin cephalic response.
2. **Stay Hydrated with Electrolytes**: Add a pinch of sea salt or unsweetened electrolytes to your water to avoid morning headaches.
3. **Break the Fast Gently**: Start with lean protein and fiber (e.g. eggs, Greek yogurt, or bone broth) before heavy starch to avoid sharp blood sugar spikes.
4. **Total Daily Calories Still Matter**: Fasting is a meal-timing schedule—your overall energy balance and protein intake still determine fat loss and muscle gain!`
  }

  // 9. Water & Hydration
  if (/\b(water|hydration|dehydrated|drink water|liters|glasses)\b/i.test(q)) {
    return `Hydration recommendations:

• **Daily Baseline**: Aim for 30–35 ml of water per kg of body weight (approx. 2.5–3.5 liters for most active adults).
• **Metabolic Boost**: Drinking 500ml of cold water can temporarily boost resting metabolic rate by 20–30% through thermogenesis.
• **Hunger vs. Thirst**: Mild dehydration often mimics hunger. When unexpected cravings hit, drink a tall glass of water and wait 10 minutes.
• **Log with openKCal**: Track your glasses on the Water & Hydration card on your Diary tab!`
  }

  // 10. Contextual Fallback
  return `Here is a look at your nutrition profile today:
• **Logged**: ${kcalLogged} kcal (${proteinLogged}g protein, ${carbsLogged}g carbs, ${fatLogged}g fat)
• **Remaining Budget**: ${rem} kcal towards your daily target

How can I best assist you?
• Ask for meal or snack suggestions tailored to your remaining calories
• Ask how to hit your protein target or reduce bloating
• Or tap **Photo Food → AI Dish** or **Scan Label (OCR)** to log foods with your camera!`
}

export default function CoachChat() {
  const coachChat = useStore((s) => s.coachChat) || []
  const profile = useStore((s) => s.profile)
  const diary = useStore((s) => s.diary[today()]) || []
  const weights = useStore((s) => s.weights)
  const exercises = useStore((s) => s.exercises?.[today()]) || []
  const { addCoachMessage, clearCoachChat, addEntry } = useStore.getState()
  const { toast } = useUI.getState()
  const user = useSync((s) => s.user)
  const aiReady = !!user?.ai?.ready

  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [photoLogging, setPhotoLogging] = useState(false)
  const [labelScanning, setLabelScanning] = useState(false)
  const endRef = useRef(null)

  // Same numbers as the Diary ring: profile targets, minus food, plus exercise burned
  const eaten = sum(diary)
  const burned = exercises.reduce((acc, x) => acc + (x.kcal || 0), 0)
  const { target: targetKcal, remaining } = remainingKcal(dayTargets(profile, weights), eaten, burned)

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
        const context = `Eaten today: ${Math.round(eaten.kcal)} kcal (${Math.round(eaten.protein)}g protein, ${Math.round(eaten.carbs)}g carbs, ${Math.round(eaten.fat)}g fat). Daily target: ${targetKcal} kcal. Burned by exercise: ${Math.round(burned)} kcal. Remaining: ${remaining} kcal (use this exact number). Goal: ${profile?.goal || 'hold'}.`
        const r = await api('POST', '/api/ai/coach', { prompt: text, context }).catch(() => null)

        if (r?.ok && r.body?.text) {
          addCoachMessage({ role: 'coach', text: r.body.text })
          setBusy(false)
          return
        }
      }

      // Smart local fallback advice
      setTimeout(() => {
        const reply = getLocalAdvice(text, eaten, remaining, profile)
        addCoachMessage({ role: 'coach', text: reply })
        setBusy(false)
      }, 500)
    } catch {
      addCoachMessage({ role: 'coach', text: getLocalAdvice(text, eaten, remaining, profile) })
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
            className="coach-tool-btn"
            onClick={() => setPhotoLogging(true)}
          >
            <Icon name="camera" style={{ color: 'var(--acc)' }} /> Photo Food → AI Dish
          </button>
          <button
            type="button"
            className="coach-tool-btn"
            onClick={() => setLabelScanning(true)}
          >
            <Icon name="barcode" style={{ color: 'var(--blue)' }} /> Scan Label (OCR)
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  textAlign: 'start',
                  margin: 0,
                  width: '100%',
                }}
                onClick={() => send(p)}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--surface-2)',
                    color: 'var(--acc)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                    fontSize: 15,
                  }}
                >
                  <Icon name="sparkles" />
                </span>
                <span style={{ flex: 1, fontSize: 'var(--fs-subhead)', fontWeight: 500, color: 'var(--label)' }}>
                  {p}
                </span>
                <Icon name="chevronRight" className="lrow-c" style={{ fontSize: 16 }} />
              </button>
            ))}
          </div>
        )}

        {/* Message history */}
        {coachChat.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            {m.role === 'coach' ? <Markdown text={m.text} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}
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
