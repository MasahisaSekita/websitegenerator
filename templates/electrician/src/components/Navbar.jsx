import { copy } from '../business.js'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, Phone, ArrowUpRight, ChevronDown, Zap } from 'lucide-react'
import { NAV, SITE } from '../site.js'
import { scrollToForm } from '../lib/scrollToForm.js'
import Logo from './Logo.jsx'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [mobileGroup, setMobileGroup] = useState("Services")
  const [menuOpen, setMenuOpen] = useState(false)
  const lastY = useRef(0)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 40)
      // auto-hide while scrolling down, reveal on the slightest scroll up
      if (y > 320 && y > lastY.current + 6) setHidden(true)
      else if (y < lastY.current - 6 || y <= 320) setHidden(false)
      lastY.current = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setOpen(false); setMenuOpen(false); setHidden(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const onDark = !scrolled && !menuOpen
  const linkBase = 'px-3 py-2 rounded-full text-sm font-medium tracking-tight transition-colors'
  const linkIdle = onDark ? 'text-white/80 hover:text-white' : 'text-ink/75 hover:text-ink'
  const linkActive = onDark ? 'text-white' : 'text-primary-dark'

  return (
    <>
      <nav
        className={`fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.25rem)] sm:w-[calc(100%-2rem)] max-w-6xl rounded-full isolate transition-transform duration-500 px-3 sm:px-4 py-2.5 ${hidden && !menuOpen ? '-translate-y-[140%]' : 'translate-y-0'}`}
        aria-label={"Main navigation"}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 rounded-full bg-white/90 backdrop-blur-xl shadow-xl shadow-deep/10 transition-opacity duration-300 ${scrolled || menuOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center shrink-0 pl-1 group" aria-label={copy("Your Company — home")}>
            <Logo tone={onDark ? 'light' : 'dark'} className="transition-transform duration-500 group-hover:scale-[1.02]" />
          </Link>

          {/* Desktop */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV.map((item) =>
              item.children ? (
                <div key={item.label} className="relative" onMouseEnter={() => setMenuOpen(true)} onMouseLeave={() => setMenuOpen(false)}>
                  <NavLink
                    to={item.href}
                    className={({ isActive }) => `inline-flex items-center gap-1 ${linkBase} ${isActive || menuOpen ? linkActive : linkIdle}`}
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {item.label}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} strokeWidth={2.4} />
                  </NavLink>
                  <div className={`absolute left-1/2 -translate-x-1/2 top-full pt-3 transition-all duration-300 ${menuOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
                    <div className="w-[760px] rounded-4xl bg-white border border-divider shadow-2xl shadow-deep/15 p-3 grid grid-cols-3 gap-1">
                      {item.children.map((c) => (
                        <div key={c.href} className="rounded-3xl p-3 hover:bg-background transition-colors">
                          <Link to={c.href} className="block group/item">
                            <span className="font-display font-semibold text-ink group-hover/item:text-primary-dark transition-colors">{c.label}</span>
                            {c.blurb && <span className="block text-xs text-muted mt-1 leading-snug">{c.blurb}</span>}
                          </Link>
                          {c.children && (
                            <ul className="mt-3 space-y-1.5 border-l border-divider pl-3">
                              {c.children.map((s) => (
                                <li key={s.href}><Link to={s.href} className="text-[13px] text-muted hover:text-primary-dark transition-colors">{s.label}</Link></li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                      <div className="col-span-3 mt-1 rounded-3xl bg-deep text-white p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="h-9 w-9 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center"><Zap className="h-4 w-4 text-accent" strokeWidth={2.4} /></span>
                          <div>
                            <p className="font-display font-semibold text-sm">{"Need urgent help?"}</p>
                            <p className="text-white/60 text-xs">{"Contact us to discuss your requirements."}</p>
                          </div>
                        </div>
                        <a href={SITE.phoneHref} className="magnetic-btn inline-flex items-center gap-2 bg-white text-deep px-4 py-2 rounded-full text-sm font-semibold"><Phone className="h-4 w-4" /> {SITE.phone}</a>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <NavLink key={item.href} to={item.href} end={item.href === '/'} className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
                  {item.label}
                </NavLink>
              )
            )}
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <a href={SITE.phoneHref} className={`lift-on-hover inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 transition-colors ${onDark ? 'text-white' : 'text-ink'}`}>
              <Phone className={`h-4 w-4 ${onDark ? 'text-accent' : 'text-primary'}`} strokeWidth={2.4} /> {SITE.phone}
            </a>
            <button
              type="button"
              onClick={() => scrollToForm(navigate)}
              className={`magnetic-btn inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-colors ${onDark ? 'bg-white text-deep shadow-deep/20' : 'bg-primary text-deep shadow-primary/30'}`}
            >{"\n              Get a quote "}<ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* Mobile controls */}
          <div className="flex lg:hidden items-center gap-1">
            <a href={SITE.phoneHref} aria-label={"Call us"} className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${onDark ? 'bg-white text-deep' : 'bg-primary text-deep'}`}>
              <Phone className="h-4 w-4" strokeWidth={2.4} />
            </a>
            <button type="button" onClick={() => setOpen(true)} className={`h-10 w-10 rounded-full flex items-center justify-center ${onDark ? 'text-white' : 'text-ink'}`} aria-label={"Open menu"}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay */}
      <div className={`fixed inset-0 z-[60] lg:hidden transition-all duration-500 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-deep/90 backdrop-blur-2xl" onClick={() => setOpen(false)} />
        <div className={`absolute top-0 left-0 right-0 max-h-[100dvh] overflow-y-auto bg-background rounded-b-5xl px-6 pt-6 pb-10 transition-transform duration-500 ${open ? 'translate-y-0' : '-translate-y-full'}`}>
          <div className="flex items-center justify-between mb-8">
            <Logo tone="dark" />
            <button type="button" onClick={() => setOpen(false)} className="h-10 w-10 rounded-full bg-divider/50 flex items-center justify-center" aria-label={"Close menu"}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-col">
            {NAV.map((item) =>
              item.children ? (
                <div key={item.label} className="border-b border-divider">
                  <div className="flex items-center justify-between">
                    <Link to={item.href} className="font-display text-2xl font-semibold text-ink py-3">{item.label}</Link>
                    <button type="button" onClick={() => setMobileGroup(mobileGroup === item.label ? '' : item.label)} className="h-10 w-10 rounded-full flex items-center justify-center text-ink" aria-label={"Show submenu"}>
                      <ChevronDown className={`h-5 w-5 transition-transform ${mobileGroup === item.label ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  <div className={`grid transition-all duration-400 ${mobileGroup === item.label ? 'grid-rows-[1fr] opacity-100 pb-3' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      {item.children.map((c) => (
                        <div key={c.href} className="pl-3 py-1.5">
                          <Link to={c.href} className="text-lg font-medium text-ink/85">{c.label}</Link>
                          {c.children && (
                            <div className="pl-3 mt-1 border-l border-divider flex flex-col gap-1.5 py-1">
                              {c.children.map((s) => <Link key={s.href} to={s.href} className="text-[15px] text-muted">{s.label}</Link>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link key={item.href} to={item.href} className="font-display text-2xl font-semibold text-ink py-3 border-b border-divider">{item.label}</Link>
              )
            )}
          </div>
          <div className="mt-8 grid gap-3">
            <button type="button" onClick={() => { setOpen(false); setTimeout(() => scrollToForm(navigate), 350) }} className="magnetic-btn flex items-center justify-center gap-2 bg-primary text-deep px-6 py-4 rounded-full font-semibold w-full">{"\n              Get a quote "}<ArrowUpRight className="h-4 w-4" />
            </button>
            <a href={SITE.phoneHref} className="flex items-center justify-center gap-2 bg-deep text-white px-6 py-4 rounded-full font-semibold w-full">
              <Phone className="h-4 w-4" />{" Call "}{SITE.phone}
            </a>
          </div>
          <p className="mt-6 text-center text-xs text-muted">{"Mon–Thu 07:00–15:00 · Friday 07:00–14:00 · "}{SITE.hoursNote}</p>
        </div>
      </div>
    </>
  )
}
