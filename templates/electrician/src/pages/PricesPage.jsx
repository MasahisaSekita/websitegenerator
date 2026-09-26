import { asset } from '../business.js'
import { copy } from '../business.js'
import { Check, Info } from 'lucide-react'
import { useSEO } from '../lib/useSEO.js'
import { renderMd } from '../lib/md.jsx'
import Reveal from '../lib/Reveal.jsx'
import PageHero from '../components/PageHero.jsx'
import ContactSection from '../components/ContactSection.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import { QuoteBtn } from '../components/Buttons.jsx'

/* All prices and terms verbatim from /pricing */
const GROUPS = [
 {title: 'Small electrical jobs', label: 'Tell us what you need', lines: [{name: 'Lighting, sockets and everyday updates', price: 'Request a quote', unit: 'Based on your requirements'}]},
 {title: 'Renovations and installations', label: 'Plan the work', lines: [{name: 'Discuss the scope and materials', price: 'Request a quote', unit: 'For your specific project'}]},
 {title: 'Fault finding', label: 'Describe the issue', lines: [{name: 'Assessment and next steps', price: 'Contact us', unit: 'Confirm availability'}]},
 {title: 'Scheduling', lines: [{name: 'Preferred timing', text: 'Contact us to discuss a suitable time for the work.'}]},
 {title: 'Your quotation', accent: true, lines: [{name: 'Understand the costs', text: 'Ask for the scope, materials, labour and any additional charges in writing.'}]},
 {title: 'Access and location', lines: [{name: 'Property details', text: 'Let us know the address and any access requirements when you enquire.'}]},
]
const FINE_PRINT = ['Ask which materials and charges are included in your quotation.', 'Confirm the agreed scope and timing before work begins.']

export default function PricesPage() {
  useSEO({
    title: copy("Electrical quotes for your home | Your Company"),
    description: "Request a quote based on your property and the electrical work you need.",
    path: '/pricing',
    image: asset("/images/panel-testing.jpg"),
  })
  return (
    <>
      <PageHero
        image={asset("/images/panel-testing.jpg")}
        imageAlt={"Electrical quotes for your home"}
        crumbs={[{ label: "Home", href: '/' }, { label: "Prices", href: '/pricing' }]}
        eyebrow={"Prices & terms · request a quotation"}
        h1={"Electrical quotes for your home"}
        intro={[
          "Tell us about the work you need. A quotation can take account of your property, the scope and the materials involved.",
          "Contact us to discuss the next steps and confirm availability.",
        ]}
      />

      <section className="relative px-6 sm:px-10 lg:px-16 pt-20 sm:pt-28 pb-10">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow={"Prices & terms"} title={"Prices &"} flourish={"Terms"} lead={"Ask what is included in your quote, including materials, labour and applicable taxes."} />
          <Reveal delay={120} className="mt-8 inline-flex items-center gap-2 rounded-full bg-deep text-white px-4 py-2 font-mono text-[11px] uppercase tracking-widest">{"Contact us to discuss your requirements."}</Reveal>

          <div className="mt-8 grid md:grid-cols-2 gap-5">
            {GROUPS.map((g, i) => (
              <Reveal key={g.title} delay={(i % 2) * 100}>
                <article className={`h-full rounded-4xl border p-6 sm:p-8 transition-all duration-500 hover:-translate-y-1 ${g.accent ? 'bg-deep text-white border-deep shadow-2xl shadow-deep/20' : 'bg-white border-divider shadow-sm hover:shadow-xl hover:shadow-primary/10'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className={`font-display font-bold text-xl sm:text-2xl leading-tight ${g.accent ? 'text-white' : 'text-ink'}`}>{g.title}</h3>
                    <span className={`font-mono text-[10px] uppercase tracking-widest pt-1 ${g.accent ? 'text-accent' : 'text-primary/60'}`}>{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  {g.intro && <p className={`mt-3 text-sm leading-relaxed ${g.accent ? 'text-white/70' : 'text-muted'}`}>{g.intro}</p>}
                  <ul className={`mt-5 divide-y ${g.accent ? 'divide-white/10' : 'divide-divider'}`}>
                    {g.lines.map((l) => (
                      <li key={l.name} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <span className={`font-semibold ${g.accent ? 'text-white' : 'text-ink'}`}>{l.name}</span>
                          {l.price && (
                            <span className="flex items-baseline gap-1.5">
                              <span className={`font-display font-extrabold text-2xl sm:text-3xl tabular-nums ${g.accent ? 'text-accent' : 'text-primary-dark'}`}>{l.price}</span>
                              <span className={`text-xs ${g.accent ? 'text-white/60' : 'text-muted'}`}>{l.unit}</span>
                            </span>
                          )}
                        </div>
                        {l.text && <p className={`mt-1.5 text-sm leading-relaxed ${g.accent ? 'text-white/70' : 'text-muted'}`}>{l.text}</p>}
                        {l.note && <p className={`mt-1 text-xs italic ${g.accent ? 'text-white/50' : 'text-muted'}`}>{l.note}</p>}
                      </li>
                    ))}
                  </ul>
                  {g.footnote && <p className={`mt-4 text-xs italic ${g.accent ? 'text-white/50' : 'text-muted'}`}>{g.footnote}</p>}
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-12 rounded-4xl bg-primary/5 border border-primary/15 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-9 w-9 rounded-2xl bg-primary/10 text-primary-dark flex items-center justify-center"><Info className="h-4 w-4" /></span>
              <h2 className="font-display font-bold text-2xl text-ink">{"The small print — clear and simple:"}</h2>
            </div>
            <ul className="space-y-3">
              {FINE_PRINT.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px] text-muted leading-relaxed [&_strong]:text-ink">
                  <span className="mt-1 h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                  <span>{renderMd(f, `fine-${i}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6"><QuoteBtn>{"Get a no-obligation quote"}</QuoteBtn></div>
          </Reveal>
        </div>
      </section>

      <ContactSection />
    </>
  )
}
