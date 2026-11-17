import Icon from './Icon'

export function calculateDietScore(totals, goal) {
  let score = 5.0 // baseline
  const tips = []

  const targetProtein = goal?.protein || 100
  const proteinRatio = (totals.protein || 0) / Math.max(1, targetProtein)
  if (proteinRatio >= 0.9) {
    score += 2.5
    tips.push('Excellent protein intake to support muscle recovery and satiety.')
  } else if (proteinRatio >= 0.6) {
    score += 1.2
    tips.push('Good protein, but aim to hit your target with paneer, lentils, or eggs.')
  } else {
    score -= 1.0
    tips.push('Low protein intake today. Try adding dals, sprouts, tofu, or whey.')
  }

  // Fiber check (target ~25-30g)
  const fiber = totals.fibre || 0
  if (fiber >= 25) {
    score += 2.0
    tips.push('High dietary fiber reached! Great for gut health and blood sugar.')
  } else if (fiber >= 15) {
    score += 1.0
    tips.push('Moderate fiber. Consider whole grains, vegetables, and chia seeds.')
  } else {
    tips.push('Fiber is low today. Add salad, oats, or flaxseeds to meals.')
  }

  // Saturated fat check (<10% of kcal ~ 20g on 2000 kcal)
  const satFat = totals.satFat || 0
  if (satFat > 28) {
    score -= 1.5
    tips.push('Saturated fats are high. Reduce deep fried foods and heavy ghee.')
  } else if (satFat > 0 && satFat <= 20) {
    score += 0.5
  }

  // Sugar check (<35g)
  const sugar = totals.sugar || 0
  if (sugar > 45) {
    score -= 1.5
    tips.push('Added sugar is elevated. Swap sweet snacks for fresh berries or nuts.')
  } else if (sugar > 0 && sugar <= 25) {
    score += 0.5
  }

  const finalScore = Math.max(1.0, Math.min(10.0, Math.round(score * 10) / 10))
  let rating = 'Needs Attention'
  let color = 'var(--red)'
  if (finalScore >= 8.0) {
    rating = 'Optimal & Nutritious'
    color = 'var(--acc)'
  } else if (finalScore >= 6.0) {
    rating = 'Balanced & Good'
    color = 'var(--orange)'
  }

  return { score: finalScore, rating, color, tips }
}

export default function DietQualityScore({ totals, goal }) {
  if (!totals || !totals.kcal) return null

  const { score, rating, color, tips } = calculateDietScore(totals, goal)

  return (
    <div className="card score-card">
      <div className="card-head">
        <div className="card-head-main">
          <span className="card-head-g" style={{ color }}>
            <Icon name="sparkles" />
          </span>
          <div className="card-head-t">
            <span className="card-head-title">Daily Food Quality Score</span>
            <span className="card-head-sub" style={{ color }}>{rating}</span>
          </div>
        </div>
        <div className="score-pill" style={{ borderColor: color, color }}>
          <span className="score-num">{score}</span>
          <span className="score-den">/10</span>
        </div>
      </div>

      <div className="score-tips">
        {tips.slice(0, 2).map((tip, i) => (
          <div key={i} className="score-tip-item">
            <Icon name="checkCircle" className="tip-icn" style={{ color }} />
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
