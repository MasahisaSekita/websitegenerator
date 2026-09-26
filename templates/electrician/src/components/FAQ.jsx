import { useState } from 'react'
import { Plus } from 'lucide-react'
import { renderMd } from '../lib/md.jsx'
import Reveal from '../lib/Reveal.jsx'

/* Accordion FAQ + FAQPage structured data for rich results. */
export default function FAQ({ items, title = "Frequently asked questions" }) {
  const [open, setOpen] = useState(0)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') },
    })),
  }
  return (
    <section className="relative py-6">
      <script type="application/ld+json">{JSON.stringify(ld)}</script>
      <Reveal>
        <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary-dark">╱ FAQ</span>
        <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-ink mt-3 tracking-tight">{title}</h2>
      </Reveal>
      <div className="mt-8 divide-y divide-divider border-y border-divider">
        {items.map((it, i) => {
          const isOpen = open === i
          return (
            <Reveal key={i} delay={i * 40}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="w-full flex items-start justify-between gap-6 py-5 text-left group"
              >
                <h3 className="font-display font-semibold text-lg sm:text-xl text-ink leading-snug group-hover:text-primary-dark transition-colors">{it.q}</h3>
                <span className={`mt-1 shrink-0 h-8 w-8 rounded-full border border-divider flex items-center justify-center transition-all duration-300 ${isOpen ? 'bg-primary border-primary text-white rotate-45' : 'text-ink'}`}>
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                </span>
              </button>
              <div className={`grid transition-all duration-500 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100 pb-6' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="prose-template max-w-3xl">
                    {it.a.split(/\n\n+/).map((p, j) => <p key={j}>{renderMd(p, `faq-${i}-${j}`)}</p>)}
                  </div>
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}
