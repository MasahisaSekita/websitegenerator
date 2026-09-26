import { Phone, Mail, MapPin, Clock } from 'lucide-react'
import { SITE } from '../site.js'
import QuoteForm from './QuoteForm.jsx'
import Reveal from '../lib/Reveal.jsx'

const DEFAULT_TEXT = "Have a question or need more information? Send us a message and we will get back to you as soon as possible."

/* The "Kom i kontakt" section that lives on every page of the original site. */
export default function ContactSection({ heading = "Contact", text = DEFAULT_TEXT, id = 'kontakt', formId = 'kontakt-form', showForm = true }) {
  const rows = [
    { Icon: Phone, label: "Call us directly", value: SITE.phone, href: SITE.phoneHref },
    { Icon: Mail, label: "Email us", value: SITE.email, href: SITE.emailHref },
    { Icon: MapPin, label: "Address", value: SITE.address },
  ]
  return (
    <section id={id} className="relative py-24 sm:py-32 px-6 sm:px-10 lg:px-16 bg-background overflow-hidden">
      <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <Reveal>
              <span className="font-mono text-[11px] sm:text-xs uppercase tracking-[0.28em] text-primary-dark">{"╱ Contact"}</span>
              <h2 className="font-display font-extrabold text-4xl sm:text-5xl md:text-6xl text-ink mt-4 leading-[1.04] tracking-tight">
                {heading}
              </h2>
              <p className="text-muted text-lg mt-6 leading-relaxed max-w-md">{text}</p>
            </Reveal>

            <div className="mt-10 space-y-4">
              {rows.map(({ Icon, label, value, href }, i) => {
                const inner = (
                  <>
                    <span className="h-12 w-12 shrink-0 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary transition">
                      <Icon className="h-5 w-5 text-primary group-hover:text-deep transition" />
                    </span>
                    <span>
                      <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">{label}</span>
                      <span className="font-display font-semibold text-ink text-lg">{value}</span>
                    </span>
                  </>
                )
                return (
                  <Reveal key={label} delay={i * 80}>
                    {href ? (
                      <a href={href} className="lift-on-hover flex items-center gap-4 group">{inner}</a>
                    ) : (
                      <div className="flex items-center gap-4 group">{inner}</div>
                    )}
                  </Reveal>
                )
              })}
              <Reveal delay={260}>
                <div className="flex items-start gap-4">
                  <span className="h-12 w-12 shrink-0 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </span>
                  <span>
                    <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">{"Opening hours"}</span>
                    <span className="block font-display font-semibold text-ink text-base leading-relaxed">
                      {SITE.hours.map(([d, h]) => <span key={d} className="block">{d}: {h}</span>)}
                    </span>
                    <span className="block text-xs text-muted italic mt-1">{SITE.hoursNote}</span>
                  </span>
                </div>
              </Reveal>
            </div>

          </div>

          <div className="lg:col-span-7">
            <Reveal delay={120}>
              {showForm && <QuoteForm variant="full" id={formId} />}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
