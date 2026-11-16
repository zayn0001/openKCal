import { useEffect, useRef } from 'react'

// A modal <dialog> that opens on mount, closes on Esc or ✕, and focuses its first field.
export default function Dialog({ title, onClose, children, wide = false }) {
  const ref = useRef()
  useEffect(() => {
    const d = ref.current
    if (!d.open) d.showModal()
    d.querySelector('input:not([type=hidden]), select, textarea')?.focus() // showModal would focus ✕
  }, [])
  return (
    <dialog ref={ref} onClose={onClose} className={wide ? 'wide' : undefined}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  )
}
