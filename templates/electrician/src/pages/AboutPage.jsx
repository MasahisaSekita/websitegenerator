import { asset } from '../business.js'
import { copy } from '../business.js'
import { ShieldCheck, MapPin, Users, Award } from 'lucide-react'
import { useSEO } from '../lib/useSEO.js'
import { SITE, BADGES } from '../site.js'
import Reveal from '../lib/Reveal.jsx'
import PageHero from '../components/PageHero.jsx'
import ContactSection from '../components/ContactSection.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import { TrustSignals } from '../components/HomeSections.jsx'


export default function AboutPage() {
  useSEO({ title: copy("About Your Company | Your Company"), description: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.", path: '/about', image: asset("/images/interior.jpg") })
  const facts = [
    { Icon: MapPin, title: "Based for your home", text: `${SITE.street}, ${SITE.zip} ${SITE.city}. We cover all of your area and also help customers around the local community.` },
    { Icon: ShieldCheck, title: "Electrical services", text: "Contact us to discuss your requirements." },
    { Icon: Users, title: "Personal communication", text: "Talk through your requirements and ask questions before work begins." },
    { Icon: Award, title: "Experience that matters", text: "We never compromise on the quality of our work and keep up to date on the latest technology and applicable legal requirements." },
  ]
  return (
    <>
      <PageHero
        image={asset("/images/electrician.jpg")}
        imageAlt={copy("About Your Company")}
        crumbs={[{ label: "Home", href: '/' }, { label: copy("About Your Company"), href: '/about' }]}
        eyebrow={"About us · electricians for your home"}
        h1={copy("About Your Company")}
        intro={["Your electrician for your home — serving homeowners, associations and businesses in the local community."]}
      />
      <section className="px-6 sm:px-10 lg:px-16 pt-16 sm:pt-24 pb-10">
        <div className="max-w-6xl mx-auto">
          <Reveal><div className="rounded-5xl bg-deep text-white p-16 text-center">Electrical solutions for the spaces you use every day.</div></Reveal>
        </div>
      </section>
      <section className="px-6 sm:px-10 lg:px-16 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6">
            <SectionHeading eyebrow={"Who we are"} title={"Electricians committed to"} flourish={"quality and craftsmanship."} lead={copy("When you choose Your Company, you don't just get an electrician - you get a partner with a focus on safety, quality and good communication.")} />
            <div className="mt-10 grid sm:grid-cols-2 gap-4">
              {facts.map((f, i) => (
                <Reveal key={f.title} delay={i * 80}>
                  <div className="h-full rounded-3xl bg-white border border-divider p-5 hover:border-primary/40 transition-colors">
                    <span className="h-10 w-10 rounded-2xl bg-primary/10 text-primary-dark flex items-center justify-center mb-3"><f.Icon className="h-5 w-5" strokeWidth={2.2} /></span>
                    <h3 className="font-display font-bold text-ink">{f.title}</h3>
                    <p className="text-sm text-muted mt-1.5 leading-relaxed">{f.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
          <Reveal delay={120} className="lg:col-span-6">
            <div className="relative rounded-5xl overflow-hidden shadow-2xl shadow-primary/15">
              <img src={asset("/images/interior.jpg")} alt={"Modern interior — illustrative stock photograph"} loading="lazy" className="w-full h-[420px] sm:h-[520px] object-cover object-top" />
              <div className="absolute inset-0 bg-gradient-to-t from-deep/70 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
                {BADGES.map((b) => <span key={b.src} className="bg-white/95 rounded-xl px-3 py-2"><img src={b.src} alt={b.alt} className="h-5 w-auto object-contain" /></span>)}
              </div>
            </div>
          </Reveal>
        </div>
      </section>
      <TrustSignals />
      <ContactSection />
    </>
  )
}
