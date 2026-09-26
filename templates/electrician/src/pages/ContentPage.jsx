import { asset } from '../business.js'
import { Fragment, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Check, Phone, Mail, ArrowRight, Clock } from 'lucide-react'
import { NAV, AREAS, SITE } from '../site.js'
import { useSEO } from '../lib/useSEO.js'
import { renderMd } from '../lib/md.jsx'
import Reveal from '../lib/Reveal.jsx'
import PageHero from '../components/PageHero.jsx'
import ContactSection from '../components/ContactSection.jsx'
import Reviews from '../components/Reviews.jsx'
import FAQ from '../components/FAQ.jsx'
import Gallery from '../components/Gallery.jsx'
import { SmartBtn } from '../components/Buttons.jsx'

/* ---------- helpers ---------- */
function findService(path) {
  const group = NAV.find((n) => n.label === "Services")
  for (const c of group.children) {
    if (c.href === path) return { item: c, parent: null }
    if (c.children) for (const s of c.children) if (s.href === path) return { item: s, parent: c }
  }
  return null
}
function findArea(path) {
  for (const [key, list] of Object.entries(AREAS)) {
    const hit = list.find((a) => a.href === path)
    if (hit) return { key, item: hit, list }
  }
  return null
}
function crumbsFor(data) {
  const c = [{ label: "Home", href: '/' }]
  const svc = findService(data.path)
  if (svc) {
    c.push({ label: "Services", href: '/services' })
    if (svc.parent) c.push({ label: svc.parent.label, href: svc.parent.href })
    c.push({ label: svc.item.label, href: data.path })
    return c
  }
  const area = findArea(data.path)
  if (area) {
    const parentHref = area.key === 'elektriker' ? '/maintenance' : area.key === 'installatoer' ? '/electrical-installation' : '/rewiring'
    const parentLabel = area.key === 'elektriker' ? "Electrician" : area.key === 'installatoer' ? "Electrical contractor" : "Electrical renovation"
    c.push({ label: "Services", href: '/services' }, { label: parentLabel, href: parentHref }, { label: area.item.label, href: data.path })
    return c
  }
  c.push({ label: data.h1, href: data.path })
  return c
}
function relatedFor(data) {
  const area = findArea(data.path)
  if (area) return { title: "We also cover", links: area.list.filter((a) => a.href !== data.path) }
  const svc = findService(data.path)
  if (svc) {
    const group = NAV.find((n) => n.label === "Services")
    const siblings = svc.parent ? svc.parent.children : group.children
    return { title: svc.parent ? `More about ${svc.parent.label.toLowerCase()}` : "Other services", links: siblings.filter((s) => s.href !== data.path).map((s) => ({ label: s.label, href: s.href })) }
  }
  return { title: "Services", links: NAV.find((n) => n.label === "Services").children.map((s) => ({ label: s.label, href: s.href })) }
}

/* Split blocks into "article runs" separated by full-width special sections */
const SPECIAL = new Set(['contact', 'reviews', 'faq', 'gallery', 'video'])
function segment(blocks) {
  const out = []
  let run = []
  for (const b of blocks) {
    if (SPECIAL.has(b.type)) {
      if (run.length) { out.push({ kind: 'run', blocks: run }); run = [] }
      out.push({ kind: b.type, block: b })
    } else run.push(b)
  }
  if (run.length) out.push({ kind: 'run', blocks: run })
  return out
}

/* ---------- block renderers ---------- */
function Blocks({ blocks, keyPrefix }) {
  let h2Index = 0
  return blocks.map((b, i) => {
    const k = `${keyPrefix}-${i}`
    switch (b.type) {
      case 'h2':
        h2Index += 1
        return (
          <Reveal key={k} as="div" className={i === 0 ? '' : 'mt-14 sm:mt-16'}>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary/60 block mb-3">{String(h2Index).padStart(2, '0')}</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink tracking-tight leading-[1.1]">{b.text}</h2>
          </Reveal>
        )
      case 'h3':
        return <Reveal key={k} as="h3" className="font-display font-semibold text-xl sm:text-2xl text-ink mt-10 tracking-tight">{b.text}</Reveal>
      case 'p':
        return <Reveal key={k} as="p" className="prose-template mt-5 text-muted text-[15px] sm:text-base leading-relaxed [&_a]:text-primary-dark [&_a]:font-medium [&_a]:underline [&_a]:decoration-primary/30 [&_a]:underline-offset-4 hover:[&_a]:decoration-primary [&_strong]:text-ink [&_strong]:font-semibold">{renderMd(b.md, k)}</Reveal>
      case 'ul':
        return (
          <Reveal key={k} as="ul" className="mt-5 space-y-3">
            {b.items.map((it, j) => (
              <li key={j} className="flex items-start gap-3 text-ink text-[15px] sm:text-base leading-relaxed">
                <span className="mt-1 h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                <span className="[&_a]:text-primary-dark [&_a]:font-medium [&_a]:underline [&_a]:decoration-primary/30 [&_a]:underline-offset-4 [&_strong]:font-semibold">{renderMd(it, `${k}-${j}`)}</span>
              </li>
            ))}
          </Reveal>
        )
      case 'ol':
        return (
          <Reveal key={k} as="ol" className="mt-5 space-y-3">
            {b.items.map((it, j) => (
              <li key={j} className="flex items-start gap-3 text-ink text-[15px] sm:text-base leading-relaxed">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-deep text-white font-mono text-[10px] flex items-center justify-center">{j + 1}</span>
                <span className="[&_a]:text-primary-dark [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4">{renderMd(it, `${k}-${j}`)}</span>
              </li>
            ))}
          </Reveal>
        )
      case 'cta':
        return (
          <Reveal key={k} className="mt-7 flex flex-wrap gap-3">
            {b.buttons.map((btn, j) => <SmartBtn key={btn.href + j} href={btn.href} variant={j === 0 ? 'primary' : 'outline'}>{btn.label}</SmartBtn>)}
          </Reveal>
        )
      case 'img':
        return (
          <Reveal key={k} as="figure" className="mt-10 rounded-4xl overflow-hidden shadow-xl shadow-primary/10 border border-divider bg-deep">
            <img src={b.src} alt={b.alt} loading="lazy" className="w-full h-auto max-h-[560px] object-cover" />
            {b.alt && <figcaption className="px-5 py-3 text-xs text-muted bg-white font-mono uppercase tracking-widest">{b.alt}</figcaption>}
          </Reveal>
        )
      default:
        return null
    }
  })
}

function Aside({ related, variant }) {
  return (
    <div className="lg:sticky lg:top-28 space-y-4">
      {variant === 0 && (
        <Reveal className="rounded-4xl bg-deep text-white p-6 overflow-hidden relative">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/30 blur-2xl" />
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary-light">{"Need an electrician?"}</p>
          <p className="font-display font-bold text-2xl mt-2 leading-tight">{"Call us for prompt help."}</p>
          <a href={SITE.phoneHref} className="magnetic-btn mt-5 inline-flex w-full items-center justify-center gap-2 bg-white text-deep px-5 py-3.5 rounded-full font-semibold"><Phone className="h-4 w-4" /> {SITE.phone}</a>
          <a href={SITE.emailHref} className="mt-2 inline-flex w-full items-center justify-center gap-2 bg-white/10 border border-white/15 text-white px-5 py-3 rounded-full text-sm font-medium hover:bg-white/15 transition"><Mail className="h-4 w-4" /> {SITE.email}</a>
          <div className="mt-5 pt-5 border-t border-white/10 text-xs text-white/60 space-y-1">
            <p className="inline-flex items-center gap-2 text-white/80"><Clock className="h-3.5 w-3.5 text-primary-light" />{" Opening hours"}</p>
            {SITE.hours.map(([d, h]) => <p key={d}>{d}: {h}</p>)}
            <p className="italic">{SITE.hoursNote}</p>
          </div>
        </Reveal>
      )}
      <Reveal delay={80} className="rounded-4xl bg-white border border-divider p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary-dark">{related.title}</p>
        <ul className="mt-3 divide-y divide-divider">
          {related.links.map((l) => (
            <li key={l.href}>
              <Link to={l.href} className="group flex items-center justify-between py-2.5 text-[15px] font-medium text-ink hover:text-primary-dark transition-colors">
                {l.label} <ArrowRight className="h-4 w-4 text-ink/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
      {variant === 0 && (
        <Reveal delay={120} className="rounded-4xl bg-primary/5 border border-primary/15 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary-dark">{"Your quotation"}</p>
          <p className="text-sm text-muted mt-2 leading-relaxed">{"Discuss the scope and request a quotation for your project."}</p>
          <Link to="/pricing" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark">{"View prices "}<ArrowRight className="h-4 w-4" /></Link>
        </Reveal>
      )}
    </div>
  )
}

/* ---------- page ---------- */
export default function ContentPage({ data }) {
  useSEO({ title: data.title, description: data.description, path: data.path, image: data.heroImage })
  const segments = useMemo(() => segment(data.blocks || []), [data])
  const related = useMemo(() => relatedFor(data), [data])
  const hasContact = (data.blocks || []).some((b) => b.type === 'contact')
  let runIndex = -1

  return (
    <>
      <PageHero
        image={data.heroImage || (data.heroImages && data.heroImages[0]) || asset("/images/interior.jpg")}
        imageAlt={data.heroImageAlt}
        crumbs={crumbsFor(data)}
        eyebrow={"Electrical services"}
        h1={data.h1}
        intro={data.intro}
        ctas={data.heroCtas}
      />

      {segments.map((seg, i) => {
        if (seg.kind === 'run') {
          runIndex += 1
          const variant = runIndex
          return (
            <section key={i} className={`relative px-6 sm:px-10 lg:px-16 ${runIndex === 0 ? 'pt-20 sm:pt-28' : 'pt-12 sm:pt-16'} pb-16 sm:pb-24`}>
              <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 lg:gap-16">
                <article className="lg:col-span-8 max-w-3xl">
                  <Blocks blocks={seg.blocks} keyPrefix={`run-${i}`} />
                </article>
                {variant <= 1 && (
                  <aside className="lg:col-span-4">
                    <Aside related={related} variant={variant} />
                  </aside>
                )}
              </div>
            </section>
          )
        }
        if (seg.kind === 'contact') return <ContactSection key={i} />
        if (seg.kind === 'reviews') return <Reviews key={i} />
        if (seg.kind === 'faq') return (
          <section key={i} className="px-6 sm:px-10 lg:px-16 pb-16 sm:pb-24">
            <div className="max-w-7xl mx-auto"><div className="max-w-3xl"><FAQ items={seg.block.items} /></div></div>
          </section>
        )
        if (seg.kind === 'gallery') return (
          <section key={i} className="px-6 sm:px-10 lg:px-16 py-16 sm:py-24">
            <div className="max-w-7xl mx-auto">
              <Reveal className="mb-8">
                <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary-dark">{"╱ Inspiration"}</span>
                <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink mt-3 tracking-tight">{"See our work"}</h2>
              </Reveal>
              <Gallery items={seg.block.items} />
              <Reveal className="mt-8"><Link to="/inspiration" className="inline-flex items-center gap-2 font-semibold text-primary-dark">{"View all projects "}<ArrowRight className="h-4 w-4" /></Link></Reveal>
            </div>
          </section>
        )
        if (seg.kind === 'video') return (
          <section key={i} className="px-6 sm:px-10 lg:px-16 py-16">
            <div className="max-w-5xl mx-auto rounded-5xl overflow-hidden shadow-2xl bg-deep">
              <video controls playsInline preload="metadata" poster={seg.block.poster} className="w-full h-auto"><source src={seg.block.src} type="video/mp4" /></video>
            </div>
          </section>
        )
        return <Fragment key={i} />
      })}

      {!hasContact && <ContactSection />}
    </>
  )
}
