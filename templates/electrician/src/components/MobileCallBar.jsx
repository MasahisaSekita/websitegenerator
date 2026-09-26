import { Phone, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SITE } from '../site.js'
import { scrollToForm } from '../lib/scrollToForm.js'

/* Sticky conversion bar on phones/tablets. */
export default function MobileCallBar() {
  const navigate = useNavigate()
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pb-safe pointer-events-none">
      <div className="pointer-events-auto glass-dark rounded-full p-1.5 flex gap-1.5 shadow-2xl shadow-deep/40 border border-white/10">
        <a href={SITE.phoneHref} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-white text-deep font-semibold py-3 text-sm">
          <Phone className="h-4 w-4" strokeWidth={2.4} /> {SITE.phone}
        </a>
        <button type="button" onClick={() => scrollToForm(navigate)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary text-deep font-semibold py-3 text-sm">{"\n          Get a quote "}<ArrowUpRight className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
