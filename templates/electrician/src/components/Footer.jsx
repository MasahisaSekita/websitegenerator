import { asset } from '../business.js'
import { Link } from 'react-router-dom'
import { Phone, Mail, MapPin } from 'lucide-react'
import { SITE, FOOTER_MENU, AREAS, BADGES } from '../site.js'
import { QuoteBtn } from './Buttons.jsx'
import Reveal from '../lib/Reveal.jsx'
import Logo from './Logo.jsx'

export default function Footer() {
  return (
    <footer className="relative bg-deep text-white rounded-t-6xl mt-8 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-15" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[40rem] rounded-full bg-primary/20 blur-3xl" />

      <div className="relative px-6 sm:px-10 lg:px-16 pt-20 pb-28 lg:pb-10 max-w-7xl mx-auto">
        {/* Top tagline + team photo */}
        <div className="grid lg:grid-cols-12 gap-10 items-end border-b border-white/10 pb-12 mb-12">
          <Reveal className="lg:col-span-7">
            <h2 className="font-display font-extrabold text-5xl sm:text-6xl md:text-7xl leading-[0.95] tracking-tight">{"\n              Your electrician\n              "}{' '}
              <span className="font-serif italic font-medium text-primary-light block">{"for your home."}</span>
            </h2>
            <p className="text-white/55 max-w-md mt-6">{"\n              For homeowners, associations and businesses in your local community — on time and at the agreed price.\n            "}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <QuoteBtn variant="primary">{"Get a quote"}</QuoteBtn>
              <a href={SITE.phoneHref} className="lift-on-hover inline-flex items-center gap-2 bg-white/10 border border-white/15 text-white px-6 py-3.5 rounded-full font-semibold">
                <Phone className="h-4 w-4" /> {SITE.phone}
              </a>
            </div>
          </Reveal>
          <Reveal delay={150} className="lg:col-span-5">
            <div className="relative rounded-4xl overflow-hidden border border-white/10 shadow-2xl">
              <img src={asset("/images/house-dusk.jpg")} alt={"A home at dusk — illustrative stock photograph"} loading="lazy" className="w-full h-64 sm:h-72 object-cover object-top" />
              <div className="absolute inset-0 bg-gradient-to-t from-deep/70 to-transparent" />
              <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full pl-3 pr-4 py-1.5 text-deep">
                <span className="relative flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
                <span className="font-mono text-[10px] uppercase tracking-widest">{"Ready to help"}</span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-10">
          <div className="col-span-2 lg:col-span-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary-light mb-4">{"Company details"}</p>
            <div className="mb-5"><Logo tone="light" size="lg" /></div>
            <p className="text-white/70 text-sm leading-relaxed">
              <span className="font-semibold text-white">{SITE.name}</span><br />
              {SITE.address}
            </p>
            <p className="text-white/50 text-sm leading-relaxed mt-4 max-w-xs">{SITE.certLine}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {BADGES.map((b) => (
                <span key={b.src} className="bg-white rounded-xl px-3 py-2 flex items-center">
                  <img src={b.src} alt={b.alt} loading="lazy" className="h-6 w-auto object-contain" />
                </span>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary-light mb-4">{"Contact"}</p>
            <ul className="space-y-3 text-sm">
              <li>
                <span className="block text-white/40 text-xs">{"Phone:"}</span>
                <a href={SITE.phoneHref} className="text-white/85 hover:text-primary-light transition inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {SITE.phone}</a>
              </li>
              <li>
                <span className="block text-white/40 text-xs">Email:</span>
                <a href={SITE.emailHref} className="text-white/85 hover:text-primary-light transition inline-flex items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0" /> {SITE.email}</a>
              </li>
              <li>
                <span className="block text-white/40 text-xs">{"Address:"}</span>
                <span className="text-white/85 inline-flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {SITE.address}</span>
              </li>
            </ul>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary-light mb-3 mt-8">{"Opening hours"}</p>
            <ul className="space-y-1.5 text-sm text-white/75">
              {SITE.hours.map(([d, h]) => <li key={d}>{d}: {h}</li>)}
            </ul>
            <p className="text-white/40 text-xs italic mt-2">{SITE.hoursNote}</p>
          </div>

          <div className="lg:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary-light mb-4">Menu</p>
            <ol className="space-y-2">
              {FOOTER_MENU.map((m, i) => (
                <li key={m.label} className="flex gap-2 text-sm">
                  <span className="font-mono text-[10px] text-white/30 pt-1">{String(i + 1).padStart(2, '0')}</span>
                  <Link to={m.href} className="text-white/75 hover:text-primary-light transition">{m.label}</Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="col-span-2 md:col-span-4 lg:col-span-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary-light mb-4">{"Areas we cover"}</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
              {AREAS.elektriker.map((a) => (
                <li key={a.href}><Link to={a.href} className="text-sm text-white/75 hover:text-primary-light transition">{a.label.replace(/^Elektriker i /, '')}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-14 pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <a href={SITE.phoneHref} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"><Phone className="h-3.5 w-3.5" /> {SITE.phone}</a>
            <a href={SITE.emailHref} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"><Mail className="h-3.5 w-3.5" /> Send email</a>
            <span className="text-white/50 text-sm">Website concept by Albert</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-white/50 text-xs font-mono">
            <span>Copyright © {new Date().getFullYear()} - {SITE.name}</span>
            <span className="hidden sm:inline">|</span>
            <span>Preview only · no enquiries collected</span>
            <span className="hidden sm:inline">|</span>
            <span>Stock photos for illustration</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
