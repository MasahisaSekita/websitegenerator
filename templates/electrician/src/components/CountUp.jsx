import { useEffect, useRef, useState } from 'react'

/* Animated counter (IntersectionObserver + rAF). Supports decimals with an English decimal point. */
export default function CountUp({ target, duration = 1800, decimals = 0, className = '' }) {
  const [value, setValue] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true
          const t0 = performance.now()
          const tick = (now) => {
            const p = Math.min((now - t0) / duration, 1)
            const eased = 1 - Math.pow(1 - p, 3)
            setValue(target * eased)
            if (p < 1) requestAnimationFrame(tick)
            else setValue(target)
          }
          requestAnimationFrame(tick)
        }
      })
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [target, duration])

  const text = decimals ? value.toFixed(decimals) : Math.floor(value).toString()
  return <span ref={ref} className={className}>{text}</span>
}
