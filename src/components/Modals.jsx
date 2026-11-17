import { useEffect } from 'react'
import { useUI } from '../store/useUI'

export default function Modals() {
  const sheets = useUI((s) => s.sheets)
  const dialog = useUI((s) => s.dialog)
  const closeAll = useUI((s) => s.closeAllSheets)
  const closeDialog = useUI((s) => s.closeDialog)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (sheets.length) sheets[sheets.length - 1].close()
        else if (dialog) closeDialog()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheets, dialog, closeDialog])

  if (!sheets.length && !dialog) return null

  return (
    <>
      {sheets.length > 0 && (
        <div className="sheet-backdrop" onClick={closeAll}>
          {sheets.map((s, idx) => (
            <div
              key={s.id}
              className="sheet"
              style={{ zIndex: 100 + idx }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grab" onClick={s.close} aria-hidden="true" />
              {s.render(s.close)}
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <div className="sheet-backdrop" onClick={closeDialog}>
          <div className="center" onClick={(e) => e.stopPropagation()}>
            {dialog}
          </div>
        </div>
      )}
    </>
  )
}
