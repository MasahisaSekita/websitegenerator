import { asset } from '../business.js'
import { copy } from '../business.js'
import { Link } from 'react-router-dom'
import { Building2, Home, ArrowRight, Siren, Plug, Hammer, Wrench, BatteryCharging, ShieldAlert, Box, Zap, Layers, HousePlus, LayoutGrid } from 'lucide-react'
import { useSEO } from '../lib/useSEO.js'
import { HOME_SERVICES } from '../site.js'
import Reveal from '../lib/Reveal.jsx'
import PageHero from '../components/PageHero.jsx'
import ServicesGrid from '../components/ServicesGrid.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import ContactSection from '../components/ContactSection.jsx'
import Reviews from '../components/Reviews.jsx'

const ALL = [
  { Icon: Siren, label: "Electrical repairs", href: '/electrical-repairs', text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property." },
  { Icon: Plug, label: "Electrical installation", href: '/electrical-installation', text: "Lighting, electrical outlets, household appliances and upgrading of installations." },
  { Icon: ShieldAlert, label: "RCD safety switch", href: '/rcd-protection', text: "Safety device that switches off the current in case of malfunction of the installation." },
  { Icon: Box, label: "Electrical enclosure installation", href: '/electrical-enclosures', text: "Safe and correct solution for your home or building." },
  { Icon: Zap, label: "Consumer unit replacement", href: '/consumer-units', text: "New consumer unit that matches today's needs and current requirements." },
  { Icon: Hammer, label: "Electrical renovation", href: '/rewiring', text: "From old to new - when the installations no longer match the need." },
  { Icon: Layers, label: "Electrical contracting", href: '/electrical-contracting', text: "Planning, coordination and implementation in major projects." },
  { Icon: HousePlus, label: "Extensions", href: '/extensions', text: "Correct and secure electrical installations in new rooms and extensions." },
  { Icon: LayoutGrid, label: "Full renovation", href: '/renovations', text: "Electrical work at all phases of a total renovation of housing." },
  { Icon: Wrench, label: "Electrical maintenance", href: '/maintenance', text: "Stable electricity in everyday life - executed correctly from the start." },
  { Icon: BatteryCharging, label: "EV charger", href: '/ev-charging', text: "Discuss charging options for your property." },
]

export default function ServicesPage() {
  useSEO({
    title: copy("Explore our craftsmanship | Your Company"),
    description: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
    path: '/services',
    image: asset("/images/panel-testing.jpg"),
  })
  const segments = [
    { Icon: Building2, title: "Housing associations", text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property." },
    { Icon: Home, title: "Homeowners", text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property." },
  ]
  return (
    <>
      <PageHero
        image={asset("/images/panel-testing.jpg")}
        imageAlt={copy("Your Company — explore our craftsmanship")}
        crumbs={[{ label: "Home", href: '/' }, { label: "Services", href: '/services' }]}
        eyebrow={"Electrical services"}
        h1={"Explore our craftsmanship"}
        intro={["Our attention to detail and craftsmanship is expressed in every project we carry out. From installation of lighting to replacement of entire electrical installations."]}
      />

      <section className="px-6 sm:px-10 lg:px-16 pt-20 sm:pt-28 pb-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-5">
          {segments.map((s, i) => (
            <Reveal key={s.title} delay={i * 120}>
              <article className="h-full rounded-5xl bg-white border border-divider p-7 sm:p-10 shadow-sm hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40 transition-all duration-500">
                <span className="h-12 w-12 rounded-2xl bg-primary/10 text-primary-dark flex items-center justify-center mb-6"><s.Icon className="h-6 w-6" strokeWidth={2.2} /></span>
                <h3 className="font-display font-bold text-2xl sm:text-3xl text-ink tracking-tight">{s.title}</h3>
                <p className="text-muted text-[15px] sm:text-base leading-relaxed mt-4">{s.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-6 sm:px-10 lg:px-16 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow={"Our services"} title={"All your electrical needs,"} flourish={"under one roof."} className="mb-12" />
          <ServicesGrid items={HOME_SERVICES} />
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-divider rounded-4xl overflow-hidden border border-divider">
            {ALL.map((s, i) => (
              <Reveal key={s.href} delay={(i % 3) * 60}>
                <Link to={s.href} className="group flex h-full items-start gap-4 bg-white p-6 hover:bg-background transition-colors">
                  <span className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 text-primary-dark flex items-center justify-center group-hover:bg-primary group-hover:text-deep transition-colors"><s.Icon className="h-5 w-5" strokeWidth={2.2} /></span>
                  <span className="flex-1">
                    <span className="font-display font-semibold text-ink group-hover:text-primary-dark transition-colors block">{s.label}</span>
                    <span className="text-sm text-muted leading-snug block mt-1">{s.text}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-ink/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Reviews />
      <ContactSection />
    </>
  )
}
