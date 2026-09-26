import { asset } from '../business.js'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Star, ShieldCheck, Clock, Award } from 'lucide-react'
import { TRUST_STATS, BADGES, SITE } from '../site.js'
import Reveal from '../lib/Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'

gsap.registerPlugin(ScrollTrigger)

/* ----------------------------------------------------------------
   Trust strip — the four claims from the original front page
---------------------------------------------------------------- */
export function TrustBar() {
  const icons = [Star, Clock, ShieldCheck, Award]
  return (
    <section className="relative z-20 -mt-10 sm:-mt-14 px-4 sm:px-10 lg:px-16">
      <Reveal className="max-w-7xl mx-auto glass rounded-4xl shadow-xl shadow-deep/10 px-5 sm:px-8 py-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 lg:divide-x divide-divider">
          {TRUST_STATS.map((s, i) => {
            const Icon = icons[i]
            return (
              <div key={s.label} className="flex items-center gap-3 lg:pl-6 first:pl-0">
                <span className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 text-primary-dark flex items-center justify-center"><Icon className="h-5 w-5" strokeWidth={2.2} /></span>
                <div className="leading-tight">
                  <span className="font-display font-extrabold text-xl sm:text-2xl text-ink block">{s.value}</span>
                  <span className="text-xs sm:text-[13px] text-muted">{s.label}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-divider flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-ink font-medium">{"The job done properly, with the right solutions."}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted hidden md:inline">{"Thoughtful solutions for everyday electrical needs."}</span>
            {BADGES.map((b) => <img key={b.src} src={b.src} alt={b.alt} className="h-5 w-auto object-contain" />)}
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/* ----------------------------------------------------------------
   Pillars — counters
---------------------------------------------------------------- */
export function Pillars() {
  const ref = useRef(null)

  const pillars = [
    { n: '01', title: "Experience", target: 'Care', suffix: '', label: "in every detail", desc: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property." },
    { n: '02', title: "Reviews", target: 'Trust', suffix: '', label: "built through service", desc: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property." },
    { n: '03', title: "Fault finding", target: 'Here', suffix: '', label: "when you need us", desc: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property." },
  ]

  return (
    <section ref={ref} className="relative py-24 sm:py-32 px-6 sm:px-10 lg:px-16 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[44rem] rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="relative max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14 sm:mb-20">
          <SectionHeading eyebrow={"Our approach"} title={"An electrician you can"} flourish={"rely on."} />
          <Reveal delay={120}><p className="text-muted text-lg leading-relaxed max-w-md lg:text-right">{"Care, trust and support at every step."}</p></Reveal>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-divider rounded-5xl overflow-hidden border border-divider shadow-xl shadow-primary/5">
          {pillars.map((p, i) => (
            <article
              key={p.n}
              
              className="relative bg-surface p-8 sm:p-12 group overflow-hidden"
            >
              <div className="flex items-center justify-between mb-10">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">{p.n} / {p.title}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary/40 group-hover:bg-primary group-hover:scale-150 transition-all duration-500" />
              </div>
              <div className="flex items-end gap-1 leading-none">
                <span className="font-display font-extrabold text-5xl sm:text-6xl leading-[0.85] text-ink tabular-nums tracking-tight">
                  {p.target}
                </span>
                <span className="font-serif italic font-medium text-4xl sm:text-5xl md:text-6xl text-primary-dark mb-2 sm:mb-3">{p.suffix}</span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary-dark mt-5">{p.label}</p>
              <p className="text-muted text-[15px] mt-6 leading-relaxed max-w-xs">{p.desc}</p>
              <div className="absolute bottom-0 left-8 right-8 sm:left-12 sm:right-12 h-px bg-divider overflow-hidden">
                <div className="h-full bg-gradient-to-r from-transparent via-primary to-transparent" style={{ animation: `pillar-sweep 4s ease-in-out ${i * 0.4}s infinite` }} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------
   Protocol — sticky stacking cards
---------------------------------------------------------------- */
export function Protocol() {
  const ref = useRef(null)
  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray('.protocol-card')
      cards.forEach((card, i) => {
        if (i === cards.length - 1) return
        gsap.to(card, {
          scrollTrigger: { trigger: card, start: 'top top+=100', endTrigger: cards[cards.length - 1], end: 'top top+=120', scrub: 1 },
          scale: 0.92,
          filter: 'blur(6px) saturate(0.7)',
          opacity: 0.5,
          ease: 'none',
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  const steps = [
    {
      num: '01', title: "Advice", tagline: "We listen first.", meta: "Step 1 / Consultation",
      text: "Good cooperation starts with good dialogue. We take the time to understand your wishes and advise you so that you get a solution that suits your needs - with transparent offers and without hidden fees.",
      image: asset("/images/pendant.jpg"), alt: "Interior lighting inspiration — stock photograph",
    },
    {
      num: '02', title: "Installation", tagline: "Right from the start.", meta: "Electrical services",
      text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
      image: asset("/images/panel-testing.jpg"), alt: "Electrical panel testing — stock photograph",
    },
    {
      num: '03', title: "Documentation", tagline: "Ready for the next step.", meta: "Step 3 / Quality checks & handover",
      text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
      image: asset("/images/outdoor-lighting.jpg"), alt: "Exterior lighting — stock photograph",
    },
  ]

  return (
    <section id="proces" ref={ref} className="relative px-4 sm:px-6 py-20">
      <div className="max-w-7xl mx-auto mb-14 px-2 sm:px-10">
        <SectionHeading eyebrow={"How we work"} title={"Three steps."} flourish={"No surprises."} />
      </div>
      <div className="space-y-8">
        {steps.map((s) => (
          <article key={s.num} className="protocol-card sticky top-24 sm:top-28 mx-auto max-w-6xl bg-gradient-to-br from-surface to-background border border-divider rounded-5xl sm:rounded-6xl overflow-hidden shadow-2xl shadow-primary/5">
            <div className="grid lg:grid-cols-5 gap-0 min-h-[60vh] lg:min-h-[70vh]">
              <div className="lg:col-span-3 p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-[0.25em] text-muted">{s.meta}</span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-primary-dark bg-primary/10 px-2.5 py-1 rounded-full">{SITE.name}</span>
                </div>
                <div className="my-10">
                  <span className="font-display font-extrabold text-[6rem] sm:text-[9rem] leading-none text-primary/15 -mb-4 block">{s.num}</span>
                  <h3 className="font-display font-bold text-4xl sm:text-5xl md:text-6xl text-ink leading-[1.02] tracking-tight">{s.title}</h3>
                  <p className="font-serif italic text-primary-dark text-2xl sm:text-3xl mt-3">{s.tagline}</p>
                </div>
                <p className="text-muted text-base sm:text-lg leading-relaxed max-w-lg">{s.text}</p>
              </div>
              <div className="lg:col-span-2 relative overflow-hidden min-h-[280px] lg:min-h-full bg-deep">
                <img src={s.image} alt={s.alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-deep/60 via-transparent to-deep/15" />
                <div className="absolute top-5 left-5 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full pl-3 pr-4 py-1.5 shadow-lg">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink">{"Step "}{s.num}</span>
                </div>
                <div className="absolute bottom-4 right-4 font-mono text-[10px] uppercase tracking-widest text-white/70">{s.num} / {SITE.name}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------
   Template qualifications
---------------------------------------------------------------- */
export function TrustSignals() {
  return <section className="py-16 px-6 sm:px-10 lg:px-16">
    <div className="max-w-6xl mx-auto rounded-4xl border border-divider p-10 text-center">
      <h2 className="font-display font-bold text-3xl">Let’s talk about your project</h2>
      <p className="text-muted mt-4">Talk to us about your property, your plans and the electrical work you need.</p>
    </div>
  </section>
}
