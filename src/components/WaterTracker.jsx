import Icon from './Icon'

export default function WaterTracker({ date, glasses = 0, onAddWater, goalGlasses = 10 }) {
  const mlPerGlass = 250
  const ml = glasses * mlPerGlass
  const goalMl = goalGlasses * mlPerGlass
  const pct = Math.min(100, Math.round((glasses / Math.max(1, goalGlasses)) * 100))

  return (
    <div className="card water-card">
      <div className="card-head">
        <div className="card-head-main">
          <span className="card-head-g icon-tint-sky">
            <Icon name="drop" />
          </span>
          <div className="card-head-t">
            <span className="card-head-title">Water & Hydration</span>
            <span className="card-head-sub">{ml} ml of {goalMl} ml target ({pct}%)</span>
          </div>
        </div>
        <div className="card-head-actions">
          <button
            type="button"
            className="iconbtn"
            disabled={glasses <= 0}
            onClick={() => onAddWater(date, -1)}
            aria-label="Remove glass"
          >
            <Icon name="minus" />
          </button>
          <button
            type="button"
            className="iconbtn on-ss"
            onClick={() => onAddWater(date, 1)}
            aria-label="Add glass"
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>

      {/* Visual Glass Indicators */}
      <div className="water-glasses-strip">
        {Array.from({ length: Math.max(goalGlasses, glasses) }).map((_, i) => {
          const filled = i < glasses
          return (
            <button
              key={i}
              type="button"
              className={'water-glass-dot' + (filled ? ' filled' : '')}
              onClick={() => onAddWater(date, i < glasses ? -1 : 1)}
              aria-label={`Glass ${i + 1}`}
            >
              <Icon name="drop" />
            </button>
          )
        })}
      </div>

      <div className="water-quick-buttons">
        <button
          type="button"
          className="btn sm tinted"
          onClick={() => onAddWater(date, 1)}
        >
          <Icon name="drop" /> +250 ml (1 glass)
        </button>
        <button
          type="button"
          className="btn sm tinted"
          onClick={() => onAddWater(date, 2)}
        >
          <Icon name="glassWater" /> +500 ml (Bottle)
        </button>
      </div>
    </div>
  )
}
