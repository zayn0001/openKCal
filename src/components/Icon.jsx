import { memo } from 'react'

// openKCal stroke-based icon set matching openGym conventions:
// 24×24 viewBox, live area 3..21, stroke-width from --icon-stroke (1.7 default),
// round caps + round joins, currentColor. No emoji in chrome.

const P = {
  /* ---- navigation & tabs ---- */
  house: <path d="M3.5 10.7 12 3.8l8.5 6.9M5.9 9.4V19a1.4 1.4 0 0 0 1.4 1.4h9.4A1.4 1.4 0 0 0 18.1 19V9.4" />,
  calendar: <><rect x="3.4" y="5.2" width="17.2" height="15.4" rx="3.2" /><path d="M8.2 3.4v3.4M15.8 3.4v3.4M3.4 10.2h17.2" /></>,
  chart: <path d="M4.5 20.2V13M9.5 20.2V6.4M14.5 20.2v-5.1M19.5 20.2V9.6" />,
  gear: <><path d="M20.48 10.59 20.48 13.41 18.58 13.72 17.87 15.43 19 17 17 19 15.43 17.87 13.72 18.58 13.41 20.48 10.59 20.48 10.28 18.58 8.57 17.87 7 19 5 17 6.13 15.43 5.42 13.72 3.52 13.41 3.52 10.59 5.42 10.28 6.13 8.57 5 7 7 5 8.57 6.13 10.28 5.42 10.59 3.52 13.41 3.52 13.72 5.42 15.43 6.13 17 5 19 7 17.87 8.57 18.58 10.28Z" /><circle cx="12" cy="12" r="3.1" /></>,
  magnifier: <><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.4-4.4" /></>,
  chat: <path d="M5.6 4.8h12.8a2.2 2.2 0 0 1 2.2 2.2v8a2.2 2.2 0 0 1-2.2 2.2H11l-4.4 3.4v-3.4h-1a2.2 2.2 0 0 1-2.2-2.2V7a2.2 2.2 0 0 1 2.2-2.2Z" />,

  /* ---- food & nutrition ---- */
  utensils: <><path d="M18 4v8a2 2 0 0 1-2 2h-1M15 4v16M18 10h-3" /><path d="M6 4v5a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V4M9 11v9" /></>,
  apple: <><path d="M12 4.5c.8-1.5 2-2 3.5-2 .2 1.5-.6 2.7-1.5 3.5" /><path d="M12 6.5C10 5 6.5 5 4.5 7.5c-2 2.5-1.5 7.5 1 10.5 1.5 1.8 3.5 2.5 5 1.5 1-.7 2-.7 3 0 1.5 1 3.5.3 5-1.5 2.5-3 3-8 1-10.5-2-2.5-5.5-2.5-7.5-1Z" /></>,
  bowl: <><path d="M4 11h16a8 8 0 0 1-16 0ZM7 19h10" /><path d="M7 6c0 1.5 1 2 1 3M12 5c0 1.5 1 2 1 3M17 6c0 1.5 1 2 1 3" /></>,
  coffee: <><path d="M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 10h2.5a2.5 2.5 0 0 1 0 5H16M3 21h14" /></>,
  drop: <path d="M12 3.5C8 8.5 6 12 6 15a6 6 0 0 0 12 0c0-3-2-6.5-6-11.5Z" />,
  glassWater: <><path d="M6 4h12l-1.5 15a2 2 0 0 1-2 1.8h-5A2 2 0 0 1 7.5 19L6 4ZM7 9h10" /></>,
  flame: <path d="M12 20.4c3.2 0 5.4-2.1 5.4-5.1 0-3.9-3.4-5.6-2.6-9.8-2.5.8-4 2.9-4 5.1 0 1-.5 1.6-1.2 1.6-.8 0-1.2-.7-1.2-1.8-1.1 1.2-1.8 2.9-1.8 4.9 0 3 2.2 5.1 5.4 5.1Z" />,
  sparkles: <><path d="m8.4 3.8 1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9L4.4 7.8l2.9-1.1Z" /><path d="m16.2 12.4.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8Z" /></>,
  scale: <><rect x="3.4" y="4.4" width="17.2" height="16.2" rx="3.4" /><path d="M8.3 9.2a3.9 3.9 0 0 1 7.4 0" /><path d="M12 9.2v2.5M8.9 16.2h6.2" /></>,
  dumbbell: <><rect x="5.9" y="7.9" width="3.2" height="8.2" rx="1.3" /><rect x="14.9" y="7.9" width="3.2" height="8.2" rx="1.3" /><path d="M9.1 12h5.8M3.6 9.9v4.2M20.4 9.9v4.2" /></>,
  figureRun: <><circle cx="14.2" cy="4.9" r="1.9" /><path d="M13.4 9.1 9.6 11.4l1.7 3.3-2.4 5.4M13.4 9.1l3.4 1.5 1.4 3.4M11.3 14.7l4.3.9 1.5 4.5M9.6 11.4 6 10.2" /></>,
  ruler: <><rect x="3.4" y="8" width="17.2" height="8" rx="1.6" /><path d="M7 8v3M10.4 8v2M13.8 8v3M17.2 8v2" /></>,
  barcode: <><path d="M4 6v12M7 6v12M9 6v12M13 6v12M16 6v12M18 6v12M20 6v12" /></>,
  camera: <><path d="M3.6 8.8a2 2 0 0 1 2-2h1.9l1.3-2.1h6.4l1.3 2.1h1.9a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2Z" /><circle cx="12" cy="12.8" r="3.3" /></>,
  timer: <><circle cx="12" cy="13.4" r="7.2" /><path d="M12 9.6v3.8h2.8M9.6 3.4h4.8" /></>,
  clock: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4V12l3.1 1.9" /></>,
  trophy: <><path d="M7.6 4h8.8v4.6a4.4 4.4 0 0 1-8.8 0Z" /><path d="M7.6 5.6H4.9v1.5a3 3 0 0 0 2.9 3M16.4 5.6h2.7v1.5a3 3 0 0 1-2.9 3M12 13v3.4M8.6 20.4h6.8l-.7-4H9.3Z" /></>,
  heart: <path d="M12 20c-.4 0-.8-.1-1-.4l-6.2-6a4.6 4.6 0 0 1 0-6.6 4.4 4.4 0 0 1 6.2 0l1 1 1-1a4.4 4.4 0 0 1 6.2 0 4.6 4.6 0 0 1 0 6.6l-6.2 6c-.2.3-.6.4-1 .4Z" />,

  /* ---- actions & controls ---- */
  arrowClockwise: <><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></>,
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  minus: <path d="M5.2 12h13.6" />,
  check: <path d="m4.8 12.6 4.8 4.8L19.2 6.8" />,
  checkCircle: <><circle cx="12" cy="12" r="8.2" /><path d="m8.2 12.2 2.7 2.7 5.1-5.4" /></>,
  xmark: <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" />,
  pencil: <><path d="M17.1 3.9a2.1 2.1 0 0 1 3 3l-9.9 9.9-4 1 1-4Z" /><path d="m15.1 5.9 3 3" /></>,
  trash: <><path d="M4.8 6.6h14.4M9.4 6.6V4.8a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.8" /><path d="M6.6 6.6 7.4 19a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4l.8-12.4" /><path d="M10.4 10.2v6.4M13.6 10.2v6.4" /></>,
  chevronRight: <path d="m9.6 5.6 6.6 6.4-6.6 6.4" />,
  chevronLeft: <path d="m14.4 5.6-6.6 6.4 6.6 6.4" />,
  chevronDown: <path d="m5.6 9.4 6.4 6.2 6.4-6.2" />,
  chevronUp: <path d="m5.6 14.6 6.4-6.2 6.4 6.2" />,
  copy: <><rect x="8.4" y="8.4" width="11.6" height="11.6" rx="2.4" /><path d="M15.6 8.4v-2A2.4 2.4 0 0 0 13.2 4H6.4A2.4 2.4 0 0 0 4 6.4v6.8a2.4 2.4 0 0 0 2.4 2.4h2" /></>,
  undo: <><path d="M8.6 14.4 4.2 10l4.4-4.4" /><path d="M4.6 10h9.6a5.4 5.4 0 0 1 0 10.8h-3" /></>,
  repeat: <><path d="m17.6 4.4 2.4 2.4-2.4 2.4" /><path d="M4.4 11.6V10a3.2 3.2 0 0 1 3.2-3.2H20" /><path d="m6.4 19.6-2.4-2.4 2.4-2.4" /><path d="M19.6 12.4V14a3.2 3.2 0 0 1-3.2 3.2H4" /></>,
  info: <><circle cx="12" cy="12" r="8.2" /><path d="M12 11v5.4" /><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none" /></>,
  warning: <><path d="M12 3.4 21.2 19.4H2.8Z" /><path d="M12 9.6v4.4" /><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none" /></>,
  sun: <><circle cx="12" cy="12" r="4.4" /><path d="M12 3.6v2M12 18.4v2M20.4 12h-2M5.6 12h-2M17.94 6.06l-1.42 1.42M7.48 16.52l-1.42 1.42M17.94 17.94l-1.42-1.42M7.48 7.48 6.06 6.06" /></>,
  moon: <path d="M19.4 14.2A7.8 7.8 0 0 1 9.8 4.6a8.2 8.2 0 1 0 9.6 9.6Z" />,
  play: <path d="M8.4 5.6 18 12l-9.6 6.4Z" />,
  pause: <path d="M9.4 5.8v12.4M14.6 5.8v12.4" />,
  bell: <><path d="M6.6 10.4a5.4 5.4 0 0 1 10.8 0c0 4 1.4 5.6 1.4 5.6H5.2s1.4-1.6 1.4-5.6Z" /><path d="M10.1 19.2a2.1 2.1 0 0 0 3.8 0" /></>,
  person: <><circle cx="12" cy="8" r="3.8" /><path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" /></>,
  share: <><path d="M12 14.4V3.8M8.4 7.4 12 3.8l3.6 3.6" /><path d="M8 10.2H6.6a2 2 0 0 0-2 2v6.2a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-6.2a2 2 0 0 0-2-2H16" /></>,
  download: <path d="M12 3.8v11.4M7.6 11.2 12 15.6l4.4-4.4M4.6 19.4h14.8" />,
  lock: <><rect x="5" y="10.4" width="14" height="10" rx="2.8" /><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" /></>,
  key: <><circle cx="8.2" cy="15.8" r="3.8" /><path d="m10.9 13.1 8-8M16.6 7.4l2 2M14.6 9.4l2 2" /></>,
  plug: <><path d="M9.2 3.6v4M14.8 3.6v4" /><path d="M6.6 7.6h10.8v3a5.4 5.4 0 0 1-10.8 0Z" /><path d="M12 16v4.4" /></>,
  bolt: <path d="M13.2 3.4 5.6 13.4h6l-1 7.2 7.8-10.2h-6.2Z" />,
  list: <path d="M9 6.4h11M9 12h11M9 17.6h11M4.4 6.4h.01M4.4 12h.01M4.4 17.6h.01" />,
  tag: <><path d="M3.6 12.2V4.8a1.2 1.2 0 0 1 1.2-1.2h7.4l8.2 8.2a1.7 1.7 0 0 1 0 2.4l-6 6a1.7 1.7 0 0 1-2.4 0Z" /><circle cx="8.2" cy="8.2" r="1.3" /></>,
  cloud: <path d="M7 18.2h10.2a3.6 3.6 0 0 0 .1-7.2 5.4 5.4 0 0 0-10.4.6A3.3 3.3 0 0 0 7 18.2Z" />,
}

export const ICON_NAMES = Object.keys(P)

function Icon({ name, size, className = '', style, ...rest }) {
  const d = P[name]
  if (!d) return null
  const s = size ? { width: size, height: size } : null
  return (
    <svg
      className={'icn ' + className}
      data-icon={name}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={s ? { ...s, ...style } : style}
      {...rest}
    >
      {d}
    </svg>
  )
}

export default memo(Icon)
