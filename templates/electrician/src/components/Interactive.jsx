import { useEffect, useState } from 'react'

/* ----------------------------------------------------------------
   Card 1 — Stacked shuffler (el-installation tasks)
---------------------------------------------------------------- */
export function InstallShuffler() {
  const items = [
    { tag: "Lighting", label: "Installation of lighting and power sockets", meta: '230 V' },
    { tag: "Appliances", label: "Connecting household appliances", meta: '16 A' },
    { tag: "Upgrades", label: "Upgrading existing installations", meta: '3-faset' },
  ]
  const [stack, setStack] = useState(items)
  useEffect(() => {
    const id = setInterval(() => {
      setStack((prev) => { const n = [...prev]; n.unshift(n.pop()); return n })
    }, 3000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="relative h-44 w-full">
      {stack.map((item, i) => (
        <div
          key={item.tag}
          style={{
            transform: `translate(${i * 14}px, ${i * 14}px) scale(${1 - i * 0.05})`,
            zIndex: stack.length - i,
            opacity: 1 - i * 0.25,
            transition: 'transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.6s ease',
          }}
          className="absolute inset-0 bg-white border border-divider rounded-3xl p-5 shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary-dark bg-primary/10 px-2 py-1 rounded-full">{item.tag}</span>
            <span className="font-mono text-xs text-muted">{item.meta}</span>
          </div>
          <div className="mt-4 font-display text-lg font-semibold text-ink leading-tight">{item.label}</div>
          <div className="mt-3 flex items-center gap-1.5">
            {Array.from({ length: 24 }).map((_, idx) => (
              <span key={idx} className="h-1 w-1 rounded-full" style={{ background: idx < 24 - i * 6 ? 'rgb(var(--theme-primary))' : '#E3E8EF' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------
   Card 2 — SIGNATURE: cable + falling sparks + AC wave (electrical)
---------------------------------------------------------------- */
export function SparkWatch() {
  const statuses = [
    { text: "Stable load · all OK", label: "Stable", tone: 'emerald' },
    { text: "Earth leakage · RCD tripped", label: "Emergency", tone: 'accent' },
    { text: "Electrician on the way · 12 min", label: "Response", tone: 'primary' },
    { text: "Fault repaired · power restored", label: "Complete", tone: 'emerald' },
  ]
  const [idx, setIdx] = useState(0)
  const [count, setCount] = useState(7)
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => {
        const n = (i + 1) % statuses.length
        if (statuses[n].label === "Complete") setCount((c) => c + 1)
        return n
      })
    }, 2300)
    return () => clearInterval(id)
  }, [])

  const sparks = [
    { left: '15%', delay: '0.0s', dur: '2.6s', size: 14 },
    { left: '26%', delay: '1.3s', dur: '3.0s', size: 11 },
    { left: '38%', delay: '0.6s', dur: '2.8s', size: 16 },
    { left: '50%', delay: '1.8s', dur: '2.4s', size: 12 },
    { left: '62%', delay: '0.9s', dur: '3.1s', size: 15 },
    { left: '74%', delay: '2.0s', dur: '2.7s', size: 11 },
    { left: '85%', delay: '0.4s', dur: '2.9s', size: 14 },
  ]
  const arcs = [
    { left: '22%', delay: '0.2s' },
    { left: '48%', delay: '1.0s' },
    { left: '76%', delay: '1.8s' },
  ]
  const s = statuses[idx]
  const toneText = s.tone === 'emerald' ? 'text-emerald-600' : s.tone === 'accent' ? 'text-accent-dark' : 'text-primary-dark'
  const toneDot = s.tone === 'emerald' ? 'bg-emerald-500' : s.tone === 'accent' ? 'bg-accent' : 'bg-primary'

  return (
    <div
      className="relative h-44 w-full rounded-3xl overflow-hidden border border-primary/15"
      style={{ background: 'linear-gradient(180deg, rgb(var(--theme-primary) / 0.12) 0%, rgb(var(--theme-primary) / 0.12) 70%, rgb(var(--theme-primary) / 0.12) 100%)' }}
    >
      <div className="absolute -top-8 -left-6 h-20 w-32 rounded-full bg-white/70 blur-2xl" />
      <div className="absolute top-2 right-10 h-14 w-24 rounded-full bg-accent/20 blur-xl" />

      {/* Header strip */}
      <div className="absolute top-3 left-4 right-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 text-primary-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 4 14h7l-2 8 11-12h-7l0-8z" />
          </svg>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-dark">{"Fault finding"}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-display font-bold text-sm text-ink tabular-nums">{String(count).padStart(2, '0')}</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted">{"today"}</span>
        </div>
      </div>

      {/* Cable / conduit with junction boxes */}
      <svg className="absolute left-3 right-3 top-9 h-5" viewBox="0 0 400 20" preserveAspectRatio="none">
        <rect x="0" y="7" width="400" height="6" rx="3" fill="rgb(var(--theme-primary))" fillOpacity="0.22" />
        <rect x="0" y="9" width="400" height="2" fill="rgb(var(--theme-primary-dark))" fillOpacity="0.45" />
        <rect x="0" y="4" width="6" height="12" rx="1.5" fill="rgb(var(--theme-primary-dark))" fillOpacity="0.5" />
        <rect x="394" y="4" width="6" height="12" rx="1.5" fill="rgb(var(--theme-primary-dark))" fillOpacity="0.5" />
        {[60, 152, 248, 340].map((x) => (
          <g key={x}>
            <rect x={x - 6} y="1" width="12" height="10" rx="2" fill="rgb(var(--theme-primary-dark))" />
            <rect x={x - 3} y="4" width="6" height="4" rx="1" fill="rgb(var(--theme-accent))" />
            <rect x={x - 4} y="14" width="8" height="3" rx="1" fill="rgb(var(--theme-primary-dark))" fillOpacity="0.7" />
          </g>
        ))}
      </svg>

      {/* Falling sparks */}
      <div className="absolute inset-x-0 top-14 bottom-11 overflow-hidden">
        {sparks.map((d, i) => (
          <svg
            key={i}
            className="absolute top-0"
            style={{
              left: d.left,
              width: `${d.size}px`,
              height: `${Math.round(d.size * 1.5)}px`,
              animation: `spark-fall ${d.dur} cubic-bezier(0.55,0.05,0.7,0.45) ${d.delay} infinite`,
              filter: 'drop-shadow(0 0 4px rgb(var(--theme-accent) / 0.55))',
              transform: 'translateX(-50%)',
            }}
            viewBox="0 0 24 36"
          >
            <defs>
              <linearGradient id={`spark-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(var(--theme-primary-light))" />
                <stop offset="55%" stopColor="rgb(var(--theme-accent))" />
                <stop offset="100%" stopColor="rgb(var(--theme-accent-dark))" />
              </linearGradient>
            </defs>
            <path d="M14 2 5 20h7l-2 14 10-18h-7l1-14z" fill={`url(#spark-${i})`} />
            <path d="M12 8 9 16h3l-1 6" stroke="white" strokeOpacity="0.7" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        ))}
      </div>

      {/* AC sine wave surface */}
      <svg className="absolute bottom-9 left-3 right-3 h-4" viewBox="0 0 240 16" preserveAspectRatio="none">
        <path
          d="M0 8 Q 7.5 0, 15 8 T 30 8 T 45 8 T 60 8 T 75 8 T 90 8 T 105 8 T 120 8 T 135 8 T 150 8 T 165 8 T 180 8 T 195 8 T 210 8 T 225 8 T 240 8"
          fill="none" stroke="rgb(var(--theme-primary))" strokeOpacity="0.5" strokeWidth="1.4"
          style={{ strokeDasharray: '30 6', animation: 'ac-wave 3s linear infinite' }}
        />
        <path
          d="M0 10 Q 7.5 3, 15 10 T 30 10 T 45 10 T 60 10 T 75 10 T 90 10 T 105 10 T 120 10 T 135 10 T 150 10 T 165 10 T 180 10 T 195 10 T 210 10 T 225 10 T 240 10"
          fill="none" stroke="rgb(var(--theme-accent))" strokeOpacity="0.35" strokeWidth="0.9"
        />
      </svg>

      {/* Arc flashes */}
      <div className="absolute bottom-[34px] left-3 right-3 h-2">
        {arcs.map((r, i) => (
          <span
            key={i}
            className="absolute top-0 -translate-x-1/2 rounded-full border border-accent/70"
            style={{ left: r.left, width: '4px', height: '4px', animation: `arc-flash 2.4s ease-out ${r.delay} infinite` }}
          />
        ))}
      </div>

      {/* Status strip */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`relative h-2 w-2 rounded-full ${toneDot}`}>
            {s.tone === 'accent' && <span className={`absolute inset-0 rounded-full ${toneDot} animate-ping`} />}
          </span>
          <span key={s.text} className={`font-mono text-[10px] truncate ${toneText}`} style={{ animation: 'rain-fadein 0.35s ease-out' }}>
            {s.text}
          </span>
        </div>
        <span className={`font-mono text-[9px] uppercase tracking-[0.2em] whitespace-nowrap pl-2 ${toneText}`}>{s.label}</span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------
   Card 3 — Cursor scheduler (book a visit)
---------------------------------------------------------------- */
export function BookingScheduler() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const [step, setStep] = useState(0)
  const activeDay = 2
  useEffect(() => {
    const id = setInterval(() => setStep((p) => (p + 1) % 5), 1400)
    return () => clearInterval(id)
  }, [])
  const pos = (() => {
    switch (step) {
      case 0: return { x: 8, y: 110, opacity: 0 }
      case 1: return { x: 60, y: 60, opacity: 1 }
      case 2:
      case 3: return { x: 60 + activeDay * 36, y: 60, opacity: 1 }
      case 4: return { x: 130, y: 130, opacity: 1 }
      default: return { x: 8, y: 110, opacity: 0 }
    }
  })()
  return (
    <div className="relative h-44 w-full bg-white border border-divider rounded-3xl p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{"Plan ahead"}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-primary-dark bg-primary/10 px-2 py-0.5 rounded-full">Planning</span>
      </div>
      <div className="grid grid-cols-7 gap-2 mb-4">
        {days.map((d, i) => (
          <div
            key={i}
            className={`flex flex-col items-center justify-center h-9 rounded-xl text-xs font-medium transition-all duration-300 ${
              step >= 3 && i === activeDay ? 'bg-primary text-deep scale-110 shadow-lg shadow-primary/30' : 'bg-background text-ink'
            }`}
          >
            <span className={`font-mono text-[9px] ${step >= 3 && i === activeDay ? 'text-white/70' : 'text-muted'}`}>{d}</span>
            <span className="font-display font-semibold text-sm">{i + 7}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        className={`w-full py-2.5 rounded-2xl font-medium text-xs transition-all duration-300 ${
          step === 4 ? 'bg-accent text-deep scale-[1.02] shadow-md shadow-accent/30' : 'bg-divider/40 text-muted'
        }`}
      >
        {step >= 3 ? "Discuss your preferred day" : "Planning illustration"}
      </button>
      <div
        className="absolute pointer-events-none transition-all duration-500 ease-out"
        style={{ left: `${pos.x}px`, top: `${pos.y}px`, opacity: pos.opacity, transform: step === 3 ? 'scale(0.85)' : 'scale(1)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="#0F172A" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}
