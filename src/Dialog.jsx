import { useEffect, useRef } from 'react'
import Icon from './components/Icon'

// Modal dialog matching openGym HIG standards
export default function Dialog({ title, onClose, children, wide = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    d?.querySelector('input:not([type=hidden]), select, textarea')?.focus()
  }, [])

  return (
    <dialog ref={ref} onClose={onClose} className={wide ? 'wide center-dialog' : 'center-dialog'}>
      <header className="dialog-head">
        <h2>{title}</h2>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="xmark" />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  )
}
