import { INFO, LABEL_ORDER, macroSplit, scale } from './lib/nutrition'
import { energy, fmtAmount } from './lib/units'
import { useSettings } from './store'

/**
 * A food label: each nutrient for the chosen amount and per 100 g, with the share of energy from
 * protein, carbs and fat. With `totals` instead of `per100`, one column of totals (a day, a meal).
 * `known` (from sum()) marks totals some items had no value for.
 */
export default function Nutrition({ per100, grams, amountLabel, known, source, totals }) {
  const { units } = useSettings()
  const amount = totals || (grams != null ? scale(per100, grams) : null)
  const split = macroSplit(totals || per100)
  const show = (v, k) => (k === 'kcal' ? `${Math.round(energy(v, units.energy))} ${units.energy}` : fmtAmount(v, INFO[k].unit))
  const partial = (k) => known && known[k] != null && known[k] < known.count

  return (
    <div className="nutrition">
      <table>
        <thead>
          <tr>
            <th scope="col">Nutrition</th>
            {amount && <th scope="col">{amountLabel || `${Math.round(grams)} g`}</th>}
            {!totals && <th scope="col">per 100 g</th>}
          </tr>
        </thead>
        <tbody>
          {LABEL_ORDER.map((k) => (
            <tr key={k} className={INFO[k].sub ? 'sub' : undefined}>
              <th scope="row">{INFO[k].label}</th>
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
        <>
          <div className="split" role="img" aria-label={`Energy from protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}%`}>
            <span className="p" style={{ width: `${split.protein}%` }} />
            <span className="c" style={{ width: `${split.carbs}%` }} />
            <span className="f" style={{ width: `${split.fat}%` }} />
          </div>
          <p className="muted legend">
            <span className="dot p" /> Protein {split.protein}% <span className="dot c" /> Carbs {split.carbs}% <span className="dot f" /> Fat {split.fat}%
            <span> of energy</span>
          </p>
        </>
      )}
      {known && LABEL_ORDER.some(partial) && <p className="muted">* Some items have no value for this, so the total is at least this much.</p>}
      {source && <p className="muted">Source: {source}</p>}
    </div>
  )
}
