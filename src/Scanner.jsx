import { useEffect, useRef, useState } from 'react'

// Live camera view that reports the first barcode it sees.
export default function Scanner({ onCode }) {
  const video = useRef()
  const [error, setError] = useState('')

  useEffect(() => {
    let stream
    let timer
    let stopped = false
    const detector = new globalThis.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (stopped) return s.getTracks().forEach((t) => t.stop())
        video.current.srcObject = s
        timer = setInterval(async () => {
          const [hit] = await detector.detect(video.current).catch(() => [])
          if (hit) onCode(hit.rawValue)
        }, 300)
      })
      .catch(() => setError('Camera unavailable. Type the barcode number instead.'))
    return () => {
      stopped = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  return error ? <p className="muted">{error}</p> : <video ref={video} className="scanner" autoPlay playsInline muted />
}
