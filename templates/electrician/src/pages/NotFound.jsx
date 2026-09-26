import { copy } from '../business.js'
import { Link } from 'react-router-dom'
import { useSEO } from '../lib/useSEO.js'
import { Btn } from '../components/Buttons.jsx'
import { SITE } from '../site.js'

export default function NotFound() {
  useSEO({ title: copy("Page not found | Your Company"), description: "This page does not exist.", path: '/404' })
  return (
    <section className="min-h-[70vh] flex items-center px-6 pt-36 pb-24 bg-deep text-white rounded-b-6xl">
      <div className="max-w-2xl mx-auto text-center">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-primary-light">404</span>
        <h1 className="font-display font-extrabold text-5xl sm:text-6xl text-white mt-4 tracking-tight">{"Page "}<span className="font-serif italic font-medium text-primary-light">{"not found."}</span></h1>
        <p className="text-white/65 mt-6">{"This page may have moved. Go to the homepage or call us on "}<a href={SITE.phoneHref} className="text-primary-light font-semibold">{SITE.phone}</a>.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Btn to="/">{"Back to home"}</Btn>
          <Link to="/services" className="lift-on-hover inline-flex items-center gap-2 border border-white/20 px-6 py-3.5 rounded-full font-semibold text-white">{"View services"}</Link>
        </div>
      </div>
    </section>
  )
}
