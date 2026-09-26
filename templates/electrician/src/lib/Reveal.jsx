import { useEffect, useRef } from 'react'

/* IntersectionObserver reveal: children get .reveal → .is-visible with an optional stagger. */
export default function Reveal({ children, as: Tag = 'div', className = '', delay = 0, threshold = 0.15, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) { el.classList.add('is-visible'); return }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.style.transitionDelay = `${delay}ms`
        el.classList.add('is-visible')
        io.disconnect()
      }
    }, { threshold, rootMargin: '0px 0px -5% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [delay, threshold])
  return (
    <Tag ref={ref} className={`reveal ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
