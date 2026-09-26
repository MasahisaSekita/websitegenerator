import { Link } from 'react-router-dom'
import { ArrowRight, Siren, HousePlus, Hammer, Wrench, BatteryCharging, Plug } from 'lucide-react'
import Reveal from '../lib/Reveal.jsx'

const ICONS = { Siren, HousePlus, Hammer, Wrench, BatteryCharging, Plug }

/* Image service cards (the six front-page services). */
export default function ServicesGrid({ items, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 ${className}`}>
      {items.map((s, i) => {
        const Icon = ICONS[s.icon] || Plug
        return (
          <Reveal key={s.href} delay={(i % 3) * 100}>
            <Link to={s.href} className="group relative block rounded-4xl overflow-hidden bg-deep text-white h-[380px] sm:h-[420px] shadow-lg shadow-deep/10 hover:shadow-2xl hover:shadow-primary/20 transition-shadow duration-500">
              <img src={s.image} alt={s.alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06]" />
              <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/45 to-deep/5 group-hover:via-deep/60 transition-colors duration-500" />
              <div className="absolute top-5 left-5 h-11 w-11 rounded-2xl bg-white/12 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-colors duration-500">
                <Icon className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <span className="absolute top-6 right-6 font-mono text-[10px] text-white/50 uppercase tracking-widest">{String(i + 1).padStart(2, '0')}</span>
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                <h3 className="font-display font-bold text-2xl leading-tight">{s.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed mt-2 max-w-xs">{s.text}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-light">{"\n                  Read more "}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2.4} />
                </span>
              </div>
            </Link>
          </Reveal>
        )
      })}
    </div>
  )
}
