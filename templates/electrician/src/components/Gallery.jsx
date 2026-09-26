import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import Reveal from '../lib/Reveal.jsx'

/* Filterable masonry gallery with a keyboard-friendly lightbox. */
export default function Gallery({ items, filters, limit, className = '' }) {
  const [filter, setFilter] = useState(filters ? filters[0] : null)
  const [active, setActive] = useState(-1)

  const visible = (filter && filter !== "All" ? items.filter((i) => i.category === filter) : items).slice(0, limit || items.length)

  useEffect(() => {
    if (active < 0) return
    const onKey = (e) => {
      if (e.key === 'Escape') setActive(-1)
      if (e.key === 'ArrowRight') setActive((a) => (a + 1) % visible.length)
      if (e.key === 'ArrowLeft') setActive((a) => (a - 1 + visible.length) % visible.length)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [active, visible.length])

  return (
    <div className={className}>
      {filters && (
        <Reveal className="flex flex-wrap gap-2 mb-8">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${filter === f ? 'bg-deep text-white shadow-lg shadow-deep/20' : 'bg-white border border-divider text-ink hover:border-primary/50'}`}
            >
              {f}
            </button>
          ))}
        </Reveal>
      )}

      {visible.length === 0 ? (
        <Reveal className="rounded-4xl border border-dashed border-divider p-12 text-center text-muted">{"\n          There are no pictures in this category yet.\n        "}</Reveal>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [&>*]:mb-4">
          {visible.map((it, i) => (
            <Reveal key={it.src + i} delay={(i % 6) * 60} className="break-inside-avoid">
              <button
                type="button"
                onClick={() => setActive(i)}
                className="group relative w-full overflow-hidden rounded-3xl bg-deep text-left shadow-sm hover:shadow-2xl hover:shadow-primary/15 transition-shadow duration-500"
              >
                <img src={it.src} alt={it.alt} loading="lazy" className="w-full h-auto object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-deep/80 via-deep/0 to-deep/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-x-0 bottom-0 p-5 translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  {it.category && <span className="font-mono text-[10px] uppercase tracking-widest text-primary-light">{it.category}</span>}
                  <p className="text-white font-display font-semibold text-sm leading-snug mt-1">{it.alt}</p>
                </div>
                <span className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/90 text-deep flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      )}

      {active >= 0 && visible[active] && (
        <div className="fixed inset-0 z-[80] bg-deep/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10" onClick={() => setActive(-1)} role="dialog" aria-modal="true">
          <button type="button" aria-label={"Close"} onClick={() => setActive(-1)} className="absolute top-5 right-5 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <button type="button" aria-label={"Previous"} onClick={(e) => { e.stopPropagation(); setActive((a) => (a - 1 + visible.length) % visible.length) }} className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label={"Next"} onClick={(e) => { e.stopPropagation(); setActive((a) => (a + 1) % visible.length) }} className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
            <ChevronRight className="h-5 w-5" />
          </button>
          <figure className="max-w-6xl w-full text-center" onClick={(e) => e.stopPropagation()}>
            <img src={visible[active].src} alt={visible[active].alt} className="mx-auto max-h-[80vh] w-auto rounded-3xl shadow-2xl object-contain" />
            <figcaption className="mt-4 text-white/70 text-sm font-body">
              {visible[active].category && <span className="font-mono text-[10px] uppercase tracking-widest text-primary-light mr-3">{visible[active].category}</span>}
              {visible[active].alt}
              <span className="ml-3 font-mono text-[10px] text-white/40">{active + 1} / {visible.length}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  )
}
