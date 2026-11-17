import { INFO, LABEL_ORDER, macroSplit, scale } from './lib/nutrition'
import { energy, fmtAmount } from './lib/units'
import { useSettings } from './store'

export default function Nutrition({ per100, grams, amountLabel, known, source, totals }) {
  const { units } = useSettings()
  const amount = totals || (grams != null ? scale(per100, grams) : null)
  const split = macroSplit(totals || per100)
  const show = (v, k) => (k === 'kcal' ? `${Math.round(energy(v, units.energy))} ${units.energy}` : fmtAmount(v, INFO[k].unit))
  const partial = (k) => known && known[k] != null && known[k] < known.count

  return (
    <div className="nutrition" style={{ display: 'grid', gap: '8px' }}>
      <table className="nut-table">
        <thead>
          <tr>
            <th scope="col">Nutrition</th>
            {amount && <th scope="col">{amountLabel || `${Math.round(grams)} g`}</th>}
            {!totals && <th scope="col">Per 100 g</th>}
          </tr>
        </thead>
        <tbody>
          {LABEL_ORDER.map((k) => (
            <tr key={k} className={INFO[k].sub ? 'sub' : undefined}>
              <th scope="row" style={{ paddingLeft: INFO[k].sub ? '14px' : '4px', opacity: INFO[k].sub ? 0.75 : 1 }}>
                {INFO[k].label}
              </th>
              {amount && (
                <td>
                  {show(amount[k], k)}
                  {partial(k) && <small title={`Only ${known[k]} of ${known.count} items have this value`}> *</small>}
                </td>
              )}
              {!totals && <td>{show(per100[k], k)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {(split.protein || split.carbs || split.fat) > 0 && (
        <div style={{ marginTop: 6 }}>
          <div
            className="split"
            style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', background: 'var(--surface-3)' }}
            role="img"
            aria-label={`Energy from protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}%`}
          >
            <span style={{ width: `${split.protein}%`, background: 'var(--acc)' }} />
            <span style={{ width: `${split.carbs}%`, background: 'var(--orange)' }} />
            <span style={{ width: `${split.fat}%`, background: 'var(--pink)' }} />
          </div>
          <p className="muted legend" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, fontSize: 'var(--fs-caption)' }}>
            <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)', marginRight: 4 }} />Protein {split.protein}%</span>
            <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)', marginRight: 4 }} />Carbs {split.carbs}%</span>
            <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--pink)', marginRight: 4 }} />Fat {split.fat}%</span>
          </p>
        </div>
      )}

      {known && LABEL_ORDER.some(partial) && (
        <p className="muted" style={{ fontSize: 'var(--fs-caption2)', margin: 0 }}>* Some items have no value for this, so the total is at least this much.</p>
      )}
      {source && <p className="muted" style={{ fontSize: 'var(--fs-caption2)', margin: 0 }}>Source: {source}</p>}
    </div>
  )
}
