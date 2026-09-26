import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ChevronRight, Zap } from 'lucide-react'
import { renderMd } from '../lib/md.jsx'
import { SmartBtn } from './Buttons.jsx'
import QuoteForm from './QuoteForm.jsx'
import { SITE } from '../site.js'

/* Hero for every inner page: banner photo, breadcrumbs, H1, intro, CTAs and the quote form. */
export default function PageHero({ image, imageAlt = '', crumbs = [], eyebrow, h1, intro = [], ctas = [], showForm = true, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.ph-item', { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1, delay: 0.1, clearProps: 'opacity,transform' })
      gsap.fromTo('.ph-form', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.4, clearProps: 'opacity,transform' })
      // Safety net: never leave above-the-fold content hidden if the ticker is throttled
      gsap.delayedCall(2.5, () => gsap.set('.ph-item, .ph-form', { clearProps: 'opacity,transform' }))
    }, ref)
    return () => ctx.revert()
  }, [h1])

  const ld = crumbs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: `${SITE.domain}${c.href}` })),
      }
    : null

  return (
    <section ref={ref} className="relative overflow-hidden bg-deep text-white rounded-b-5xl sm:rounded-b-6xl">
      {ld && <script type="application/ld+json">{JSON.stringify(ld)}</script>}
      <div className="absolute inset-0">
        {image && <img src={image} alt={imageAlt} className="w-full h-full object-cover opacity-70" fetchPriority="high" />}
        <div className="absolute inset-0 bg-gradient-to-tr from-deep via-deep/75 to-deep/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/20 to-transparent" />
      </div>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[22%] right-[14%] h-2 w-2 rounded-full bg-accent/70 animate-float" style={{ animationDelay: '0s' }} />
        <div className="absolute top-[48%] right-[8%] h-1.5 w-1.5 rounded-full bg-primary-light/60 animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[34%] right-[24%] h-1 w-1 rounded-full bg-white/60 animate-float" style={{ animationDelay: '3s' }} />
      </div>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className={`relative z-10 max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pt-28 sm:pt-36 pb-14 sm:pb-20 grid gap-10 lg:gap-14 ${showForm ? 'lg:grid-cols-12 items-start lg:items-center' : ''}`}>
        <div className={showForm ? 'lg:col-span-7' : 'max-w-4xl'}>
          {crumbs.length > 0 && (
            <nav aria-label={"Breadcrumb"} className="ph-item flex flex-wrap items-center gap-1.5 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-white/55 mb-6">
              {crumbs.map((c, i) => (
                <span key={c.href} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-white/30" />}
                  {i < crumbs.length - 1 ? <Link to={c.href} className="hover:text-white transition">{c.label}</Link> : <span className="text-primary-light">{c.label}</span>}
                </span>
              ))}
            </nav>
          )}
          {eyebrow && (
            <p className="ph-item inline-flex items-center gap-2 font-mono text-[10px] sm:text-xs uppercase tracking-[0.25em] text-primary-light mb-5">
              <Zap className="h-3.5 w-3.5 text-accent" strokeWidth={2.4} /> {eyebrow}
            </p>
          )}
          <h1 className="ph-item font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.02] tracking-tight text-white">
            {h1}
          </h1>
          {intro.map((p, i) => (
            <p key={i} className={`ph-item text-white/75 text-base sm:text-lg leading-relaxed max-w-2xl ${i === 0 ? 'mt-7' : 'mt-4'} [&_a]:text-primary-light [&_a]:underline [&_a]:underline-offset-4 [&_strong]:text-white`}>
              {renderMd(p, `intro-${i}`)}
            </p>
          ))}
          {ctas.length > 0 && (
            <div className="ph-item mt-8 flex flex-wrap gap-3">
              {ctas.map((c, i) => (
                <SmartBtn key={c.href + i} href={c.href} variant={i === 0 ? 'primary' : 'glass'} size="lg">{c.label}</SmartBtn>
              ))}
            </div>
          )}
          {children}
        </div>
        {showForm && (
          <div className="ph-form lg:col-span-5">
            <QuoteForm variant="hero" id="tilbud" />
          </div>
        )}
      </div>
    </section>
  )
}
