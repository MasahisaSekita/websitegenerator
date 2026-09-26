import { asset } from '../business.js'
import { copy } from '../business.js'
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight, ArrowRight, Phone, Check } from 'lucide-react'
import { SITE, HOME_SERVICES, GALLERY } from '../site.js'
import { useSEO } from '../lib/useSEO.js'
import { renderMd } from '../lib/md.jsx'
import Reveal from '../lib/Reveal.jsx'
import { scrollToForm } from '../lib/scrollToForm.js'
import QuoteForm from '../components/QuoteForm.jsx'
import SectionHeading from '../components/SectionHeading.jsx'
import ServicesGrid from '../components/ServicesGrid.jsx'
import { Btn, QuoteBtn } from '../components/Buttons.jsx'
import { InstallShuffler, SparkWatch, BookingScheduler } from '../components/Interactive.jsx'
import { Pillars, Protocol, TrustSignals } from '../components/HomeSections.jsx'
import Reviews from '../components/Reviews.jsx'
import ContactSection from '../components/ContactSection.jsx'

gsap.registerPlugin(ScrollTrigger)

/* ----------------------------------------------------------------
   Hero — photo backdrop + headline + quote form
---------------------------------------------------------------- */
function Hero() {
  const ref = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-line-1', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.3, clearProps: 'opacity,transform' })
      gsap.fromTo('.hero-line-2', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out', delay: 0.5, clearProps: 'opacity,transform' })
      gsap.fromTo('.hero-meta, .hero-cta', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', delay: 0.8, stagger: 0.12, clearProps: 'opacity,transform' })
      gsap.fromTo('.hero-form', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', delay: 0.7, clearProps: 'opacity,transform' })
      gsap.delayedCall(2.8, () => gsap.set('.hero-line-1, .hero-line-2, .hero-meta, .hero-cta, .hero-form', { clearProps: 'opacity,transform' }))
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section id="hjem" ref={ref} className="relative min-h-[100dvh] w-full overflow-hidden bg-deep">
      {/* Static photo backdrop with the skill's dual gradient overlays (swap /images/hero.jpg to change it) */}
      <div className="absolute inset-0">
        <img src={asset("/images/hero.jpg")} alt={"Modern home with lighting in the evening"} className="w-full h-full object-cover object-center" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-tr from-deep/90 via-deep/55 to-primary/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/30 to-transparent" />
      </div>

      {/* Floating sparks */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-[18%] h-2 w-2 rounded-full bg-accent/70 animate-float" style={{ animationDelay: '0s' }} />
        <div className="absolute top-[55%] right-[10%] h-1.5 w-1.5 rounded-full bg-white/40 animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[40%] right-[26%] h-1 w-1 rounded-full bg-primary-light/70 animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-[30%] left-[8%] h-1.5 w-1.5 rounded-full bg-primary-light/50 animate-float" style={{ animationDelay: '2.2s' }} />
      </div>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pt-28 sm:pt-36 lg:pt-40 pb-24 min-h-[100dvh] grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        <div className="lg:col-span-7">
          <h1 className="font-display font-extrabold text-white leading-[0.95] tracking-tight">
            <span className="hero-line-1 block text-4xl sm:text-6xl lg:text-7xl">{"Your electrician"}</span>
            {' '}
            <span className="hero-line-2 block font-serif italic font-medium text-primary-light text-6xl sm:text-8xl lg:text-9xl mt-1" style={{ lineHeight: '0.92' }}>{"for your home"}</span>
          </h1>
          <p className="hero-meta max-w-xl text-white/75 text-base sm:text-lg mt-7 leading-relaxed">{"\n            for homeowners, associations and businesses in your local community.\n            "}<span className="text-white">{" Let’s discuss your next project."}</span>
          </p>
          <div className="hero-cta mt-9 flex flex-wrap gap-3">
            <button type="button" onClick={() => scrollToForm(navigate)} className="magnetic-btn group inline-flex items-center gap-2 bg-primary text-deep font-semibold px-7 py-4 rounded-full shadow-2xl shadow-primary/40">{"\n              Contact us "}<ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2.4} />
            </button>
            <Link to="/services" className="lift-on-hover inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-white border border-white/20 font-medium px-7 py-4 rounded-full">{"\n              Read more "}<ArrowRight className="h-4 w-4" />
            </Link>
            <a href={SITE.phoneHref} className="lift-on-hover inline-flex items-center gap-2 text-white font-semibold px-4 py-4">
              <Phone className="h-4 w-4 text-accent" strokeWidth={2.4} /> {SITE.phone}
            </a>
          </div>
        </div>
        <div className="hero-form lg:col-span-5">
          <QuoteForm variant="hero" id="tilbud" />
        </div>
      </div>

      <div className="absolute bottom-8 right-6 sm:right-12 hidden lg:flex flex-col items-center gap-2 text-white/50">
        <span className="font-mono uppercase text-[10px] tracking-[0.3em]">Scroll</span>
        <div className="h-8 w-px bg-gradient-to-b from-white/50 to-transparent" />
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------
   Features — 3 interactive cards
---------------------------------------------------------------- */
function Features() {
  const ref = useRef(null)
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.feature-card', { y: 40, opacity: 0 }, { scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true }, y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.15, clearProps: 'opacity,transform' })
    }, ref)
    return () => ctx.revert()
  }, [])
  const cards = [
    { eyebrow: '01 / Installation', heading: "Electrical installation", href: '/electrical-installation', text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.", Component: InstallShuffler },
    { eyebrow: "02 / Fault finding", heading: "Electrical repairs", href: '/electrical-repairs', text: "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.", Component: SparkWatch },
    { eyebrow: "03 / Scheduled work", heading: "Discuss your project", href: '/pricing', text: "Clear agreements and transparent prices without hidden fees. We will notify you of the expected arrival and review the task with you - before and after.", Component: BookingScheduler },
  ]
  return (
    <section id="kerneomraader" ref={ref} className="relative py-24 sm:py-32 px-6 sm:px-10 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <SectionHeading eyebrow={"Our expertise"} title={"How we can help"} flourish={"at home and at work."} className="mb-14 sm:mb-20" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {cards.map((c) => (
            <article key={c.heading} className="feature-card group relative bg-surface border border-divider rounded-5xl p-6 sm:p-7 hover:border-primary/40 transition-colors duration-500 shadow-sm hover:shadow-xl hover:shadow-primary/10">
              <div className="flex items-center justify-between mb-6">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{c.eyebrow}</span>
                <Link to={c.href} aria-label={c.heading}><ArrowUpRight className="h-5 w-5 text-ink/30 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" strokeWidth={1.8} /></Link>
              </div>
              <c.Component />
              <div className="mt-6">
                <h3 className="font-display font-bold text-2xl text-ink leading-tight"><Link to={c.href} className="hover:text-primary-dark transition-colors">{c.heading}</Link></h3>
                <p className="text-muted text-[15px] mt-4 leading-relaxed">{c.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------
   Why us — the original "Derfor vælger kunder os" copy, verbatim
---------------------------------------------------------------- */
function WhyUs() {
  const bullets = [
    "A local [electrical contractor](/electrical-installation) who understands your needs",
    "Discuss the scope and request a quote",
    "Talk to us about [electrical repairs](/electrical-repairs)",
  ]
  const more = [
    "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
    "With us, you'll have a trained electrician. We keep up to date on the latest technology and applicable legal requirements. This ensures that you always get a professional electric solution that meets both rules and expectations.",
    "Whether you need [consumer unit replacement](/consumer-units), an [RCD](/rcd-protection), an [electrical enclosure](/electrical-enclosures), extensive [rewiring](/rewiring) or [electrical contracting](/electrical-contracting), we provide professional [electrical services](/maintenance) tailored to your needs.",
    "We specialise in [EV charger installation and maintenance](/ev-charging), ensuring correct installation, documentation and a high standard of safety. We also advise homeowners and businesses on energy savings and electrical solutions that are ready for future needs.",
  ]
  return (
    <section id="derfor" className="relative py-24 sm:py-32 px-6 sm:px-10 lg:px-16 overflow-hidden">
      <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        <div className="lg:col-span-7">
          <SectionHeading eyebrow={copy("Why Your Company")} title={"Why customers choose us as their"} flourish={"electrician for your home"} />
          <Reveal delay={100} className="prose-template mt-8 max-w-2xl">
            <p>{renderMd(copy("When you choose Your Company, you get a partner focused on safety, quality and good communication. Our team supports homeowners and businesses throughout the local community."), 'why-0')}</p>
          </Reveal>
          <Reveal delay={160}>
            <ul className="mt-6 space-y-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-ink text-[15px] sm:text-base">
                  <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                  <span className="[&_a]:text-primary-dark [&_a]:font-medium [&_a]:underline [&_a]:decoration-primary/30 [&_a]:underline-offset-4">{renderMd(b, `why-b${i}`)}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={200} className="prose-template mt-6 max-w-2xl">
            <p>{"We help both homeowners and businesses with everything from installations and electricity checks to advice on energy solutions and smarthome. Our electrician is ready to deliver a safe and efficient solution - on time and at agreed price."}</p>
          </Reveal>
          <Reveal delay={240} className="mt-8">
            <QuoteBtn>{"Get help from an electrician"}</QuoteBtn>
          </Reveal>
        </div>
        <Reveal delay={150} className="lg:col-span-5 lg:sticky lg:top-28">
          <div className="relative rounded-5xl overflow-hidden shadow-2xl shadow-primary/15 aspect-[4/5]">
            <img src={asset("/images/electrician.jpg")} alt={"Electrician with tools — stock photograph"} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/70 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
              <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-4 text-deep">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{"Contact us today"}</p>
                <p className="font-display font-bold text-lg leading-tight">{"if you need an electrician"}</p>
              </div>
              <a href={SITE.phoneHref} className="h-12 w-12 shrink-0 rounded-full bg-primary text-deep flex items-center justify-center shadow-lg shadow-primary/40 ring-pulse"><Phone className="h-5 w-5" /></a>
            </div>
          </div>
        </Reveal>
      </div>

      <div className="max-w-7xl mx-auto mt-16 sm:mt-24 grid lg:grid-cols-2 gap-8 lg:gap-12">
        {more.map((p, i) => (
          <Reveal key={i} delay={(i % 2) * 100} className="prose-template">
            <div className="flex gap-4">
              <span className="font-mono text-[10px] text-primary/50 pt-1.5 shrink-0">0{i + 1}</span>
              <p>{renderMd(p, `more-${i}`)}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="max-w-7xl mx-auto mt-10 flex flex-wrap gap-3">
        <Btn href={SITE.phoneHref} icon="phone" variant="dark">{"Call us"}</Btn>
        <Btn href={SITE.emailHref} variant="outline">{"Email us"}</Btn>
      </Reveal>
    </section>
  )
}

/* ----------------------------------------------------------------
   Professional service — dark band, verbatim copy
---------------------------------------------------------------- */
function ProService() {
  const paras = [
    "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
    "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
    "Discuss your electrical needs with us. We can talk through the work, timing and quotation for your property.",
    "We also provide [emergency electrical help](/electrical-repairs) and specialise in installing [EV chargers](/ev-charging), giving you a solution that is correctly and safely installed and ready for future needs.",
  ]
  return (
    <section className="relative py-24 sm:py-32 px-6 sm:px-10 lg:px-16 bg-deep text-white overflow-hidden rounded-t-6xl">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute -top-20 -right-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <Reveal>
            <span className="font-mono text-[11px] sm:text-xs uppercase tracking-[0.28em] text-primary-light">{"╱ We are ready to help"}</span>
            <h2 className="font-display font-extrabold text-4xl sm:text-5xl md:text-6xl mt-4 leading-[1.04] tracking-tight">{"Electrical services"}{' '}
              <span className="block font-serif italic font-medium text-primary-light mt-1">{"electrician for your home"}</span>
            </h2>
            <h3 className="mt-6 font-display font-semibold text-xl text-white/85">{"Contact us today if you need an electrician"}</h3>
          </Reveal>
          <Reveal delay={150} className="mt-8 flex flex-wrap gap-3">
            <QuoteBtn variant="primary">{"Contact us here"}</QuoteBtn>
            <Btn href={SITE.phoneHref} icon="phone" variant="glass">{SITE.phone}</Btn>
          </Reveal>
        </div>
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-5">
          {paras.map((p, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="h-full rounded-4xl bg-white/[0.04] border border-white/10 p-6 hover:bg-white/[0.07] transition-colors duration-500">
                <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">0{i + 1}</span>
                <p className="mt-3 text-white/75 text-[15px] leading-relaxed [&_a]:text-primary-light [&_a]:font-medium">{renderMd(p, `pro-${i}`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------
   Latest projects — marquee of the real project photos
---------------------------------------------------------------- */
function Inspiration() {
  const items = [...GALLERY, ...GALLERY]
  return (
    <section id="projekter" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
        <SectionHeading eyebrow={"Inspiration"} title={"Lighting"} flourish="ideas." lead={"Explore lighting and interior inspiration. All images are illustrative stock photography."} />
        <Reveal delay={120}><Btn to="/inspiration" variant="dark">{"View photos"}</Btn></Reveal>
      </div>
      <Reveal className="relative">
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        <div className="flex gap-4 w-max animate-marquee hover:[animation-play-state:paused]">
          {items.map((g, i) => (
            <Link key={g.src + i} to="/inspiration" className="group relative block h-64 sm:h-80 w-56 sm:w-72 shrink-0 rounded-3xl overflow-hidden bg-deep">
              <img src={g.src} alt={g.alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1400ms] group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-deep/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <span className="font-mono text-[10px] uppercase tracking-widest text-primary-light">{g.category}</span>
                <p className="text-white text-sm font-display font-semibold leading-snug line-clamp-2">{g.alt}</p>
              </div>
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

/* ----------------------------------------------------------------
   Social — Facebook
---------------------------------------------------------------- */
function Social() {
  return (
    <section className="relative py-20 sm:py-28 px-6 sm:px-10 lg:px-16">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6">
          <SectionHeading eyebrow={"Your next project"} title={"Start with"} flourish={"a conversation"} as="h3" />
          <Reveal delay={100} className="prose-template mt-6 max-w-xl">
            <p>{"From a small electrical update to plans for a renovation, tell us what you need. Call or email to discuss your project and the next steps."}</p>
          </Reveal>
          <Reveal delay={160} className="mt-8">
            <span className="text-muted">Website concept by Albert</span>
          </Reveal>
        </div>
        <Reveal delay={120} className="lg:col-span-6">
          <div className="rounded-4xl overflow-hidden border border-divider bg-white shadow-xl shadow-primary/5">
            <div className="p-12 text-muted">Tell us about the electrical work you have in mind.</div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export default function HomePage() {
  useSEO({
    title: copy("Electrician for your home | Your Company | Get a quote today"),
    description: copy("Need an electrician in the local community? Your Company provides professional electrical services. Contact us today."),
    path: '/',
    image: asset("/images/interior.jpg"),
  })
  return (
    <>
      <Hero />
      <section id="ydelser" className="relative py-24 sm:py-32 px-6 sm:px-10 lg:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12 sm:mb-16">
            <SectionHeading eyebrow={"Services"} title={"All your electrical needs,"} flourish={"under one roof."} />
            <Reveal delay={120}><Btn to="/services" variant="outline">{"View all services"}</Btn></Reveal>
          </div>
          <ServicesGrid items={HOME_SERVICES} />
        </div>
      </section>
      <Features />
      <Reviews flourish={"Let’s discuss your project"} />
      <WhyUs />
      <Pillars />
      <Protocol />
      <ProService />
      <Inspiration />
      <TrustSignals />
      <Social />
      <ContactSection />
    </>
  )
}
