import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ShieldCheck, Star, Phone } from 'lucide-react'
import { SITE } from '../site.js'

const TOPICS = [
  "Emergency help / power outage",
  "Electrical installation",
  "Rewiring / extension",
  "EV charger",
  "Electrical maintenance / inspection",
  "Consumer unit replacement",
  "Other",
]

function Field({ label, name, type = 'text', required, value, onChange, placeholder, autoComplete, compact }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-1.5 block">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full bg-background border border-divider rounded-2xl px-4 ${compact ? 'py-3' : 'py-3.5'} text-ink placeholder-muted/50 focus:border-primary focus:ring-4 focus:ring-primary/15 outline-none transition font-body text-[15px]`}
      />
    </label>
  )
}

/**
 * Lead-capture form. `variant="hero"` = compact card for the hero, `variant="full"` = contact section.
 * Posts JSON to VITE_FORM_ENDPOINT when configured; otherwise shows a clearly labelled preview state.
 */
export default function QuoteForm({ variant = 'full', id, title, subtitle }) {
  const hero = variant === 'hero'
  const { pathname } = useLocation()
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', topic: '', message: '', website: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (status === 'sending') return
    setStatus('sending')
    try {
      const endpoint = '' // Speculative previews never send enquiries.
      if (endpoint && !form.website) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...form, page: pathname, source: 'example.com' }),
        })
        if (!res.ok) throw new Error('bad status')
      } else {
        setStatus('preview')
        return
      }
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  const cardCls = hero
    ? 'bg-white/95 backdrop-blur-xl border border-white/60 rounded-4xl p-5 sm:p-7 shadow-glow'
    : 'bg-surface border border-divider rounded-5xl p-6 sm:p-10 shadow-xl shadow-primary/5'

  if (status === 'preview') return <div id={id} className={cardCls}><h3 className="font-display text-2xl font-bold">Form preview</h3><p className="mt-3 text-muted">This is a website preview. No enquiry was sent. Please use the phone or email contact details.</p><button type="button" className="mt-4 underline" onClick={() => setStatus('idle')}>Back to form</button></div>

  if (status === 'sent') {
    return (
      <div id={id} className={`${cardCls} text-center`}>
        <div className="py-8 sm:py-12">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8 text-primary-dark" />
          </div>
          <h3 className="font-display font-bold text-2xl text-ink mb-3">{"Thank you for your enquiry"}</h3>
          <p className="text-muted max-w-md mx-auto">{"We will get back to you as soon as possible. For urgent help, call us on"}{' '}
            <a href={SITE.phoneHref} className="text-primary-dark font-semibold whitespace-nowrap">{SITE.phone}</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form id={id} onSubmit={submit} className={cardCls} noValidate={false}>
      {(title || hero) && (
        <div className={hero ? 'mb-5' : 'mb-7'}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display font-bold text-xl sm:text-2xl text-ink leading-tight">
                {title || "Get a no-obligation quote"}
              </h3>
              <p className="text-muted text-sm mt-1.5">{subtitle || "Preview form — please call or email to make an enquiry."}</p>
            </div>
          </div>
        </div>
      )}

      <div className={`grid sm:grid-cols-2 ${hero ? 'gap-3' : 'gap-5'}`}>
        <Field label={"Name"} name="name" required value={form.name} onChange={set('name')} placeholder={"Your name"} autoComplete="name" compact={hero} />
        <Field label={"Phone"} name="phone" type="tel" required value={form.phone} onChange={set('phone')} placeholder={"Phone number"} autoComplete="tel" compact={hero} />
        <Field label="E-mail" name="email" type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" compact={hero} />
        <Field label={"Address"} name="address" required value={form.address} onChange={set('address')} placeholder={"Street, postcode and town"} autoComplete="street-address" compact={hero} />
      </div>

      <div className={`grid ${hero ? 'gap-3 mt-3' : 'gap-5 mt-5'}`}>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-1.5 block">{"What do you need help with?"}</span>
          <select
            name="topic"
            value={form.topic}
            onChange={(e) => set('topic')(e.target.value)}
            className={`w-full bg-background border border-divider rounded-2xl px-4 ${hero ? 'py-3' : 'py-3.5'} text-ink focus:border-primary focus:ring-4 focus:ring-primary/15 outline-none transition font-body text-[15px] ${form.topic ? '' : 'text-muted/70'}`}
          >
            <option value="">{"Choose a service (optional)"}</option>
            {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-1.5 block">{"Message "}<span className="text-primary">*</span></span>
          <textarea
            name="message"
            required
            rows={hero ? 3 : 5}
            value={form.message}
            onChange={(e) => set('message')(e.target.value)}
            placeholder={"Briefly describe your project or what you need…"}
            className={`w-full bg-background border border-divider rounded-2xl px-4 ${hero ? 'py-3' : 'py-3.5'} text-ink placeholder-muted/50 focus:border-primary focus:ring-4 focus:ring-primary/15 outline-none transition resize-none font-body text-[15px]`}
          />
        </label>
        {/* honeypot */}
        <input type="text" name="website" value={form.website} onChange={(e) => set('website')(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      </div>

      <div className={`${hero ? 'mt-4' : 'mt-7'} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        {!hero && <p className="text-xs text-muted">{"Fields marked * are required. We will only contact you about your enquiry."}</p>}
        <button
          type="submit"
          disabled={status === 'sending'}
          className={`magnetic-btn group inline-flex items-center justify-center gap-2 bg-primary text-deep font-semibold rounded-full shadow-lg shadow-primary/30 disabled:opacity-60 ${hero ? 'w-full py-3.5' : 'px-7 py-3.5'}`}
        >
          {status === 'sending' ? "Sending…" : hero ? "Get a quote" : 'Send'}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
        </button>
      </div>
      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600">{"Something went wrong. Call us on "}<a href={SITE.phoneHref} className="font-semibold">{SITE.phone}</a>{" or email "}<a href={SITE.emailHref} className="font-semibold">{SITE.email}</a>.</p>
      )}
      {hero && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" />{"Electrical services"}</span>
          <span className="inline-flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-accent fill-accent" />{" Clear communication"}</span>
          <a href={SITE.phoneHref} className="inline-flex items-center gap-1.5 hover:text-primary-dark"><Phone className="h-3.5 w-3.5 text-primary" /> {SITE.phone}</a>
        </div>
      )}
    </form>
  )
}
