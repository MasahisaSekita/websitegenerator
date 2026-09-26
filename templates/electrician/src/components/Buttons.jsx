import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Phone } from 'lucide-react'
import { scrollToForm } from '../lib/scrollToForm.js'

const base = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors'
const sizes = { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3.5 text-[15px]', lg: 'px-7 py-4 text-base' }

export function Btn({ href, to, children, variant = 'primary', size = 'md', icon = 'arrow', className = '', onClick, ...rest }) {
  const variants = {
    primary: 'magnetic-btn bg-primary text-deep shadow-lg shadow-primary/30 hover:bg-primary-dark',
    dark: 'magnetic-btn bg-deep text-white shadow-lg shadow-deep/20 hover:bg-ink',
    accent: 'magnetic-btn bg-accent text-deep shadow-lg shadow-accent/30 hover:bg-accent-dark',
    glass: 'lift-on-hover bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/15',
    outline: 'lift-on-hover bg-transparent text-ink border border-ink/15 hover:border-primary hover:text-primary-dark',
    soft: 'lift-on-hover bg-primary/10 text-primary-dark hover:bg-primary/15',
  }
  const Icon = icon === 'phone' ? Phone : icon === 'up' ? ArrowUpRight : icon === 'none' ? null : ArrowRight
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className}`
  const inner = (
    <>
      {icon === 'phone' && <Phone className="h-4 w-4" strokeWidth={2.4} />}
      <span>{children}</span>
      {Icon && icon !== 'phone' && <Icon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />}
    </>
  )
  if (to) return <Link to={to} className={`group ${cls}`} onClick={onClick} {...rest}>{inner}</Link>
  if (href) return <a href={href} className={`group ${cls}`} onClick={onClick} {...rest}>{inner}</a>
  return <button type="button" className={`group ${cls}`} onClick={onClick} {...rest}>{inner}</button>
}

/* Smart CTA: scrolls to the quote form on the current page, else navigates to /contact */
export function QuoteBtn({ children = "Get a quote", ...props }) {
  const navigate = useNavigate()
  return (
    <Btn onClick={() => scrollToForm(navigate)} icon="up" {...props}>
      {children}
    </Btn>
  )
}

/* Resolves an href from content (internal path, tel:, mailto:, http) into the right element */
export function SmartBtn({ href, children, ...props }) {
  if (href.startsWith('/')) return <Btn to={href} {...props}>{children}</Btn>
  const phone = href.startsWith('tel:')
  return <Btn href={href} icon={phone ? 'phone' : props.icon} {...props}>{children}</Btn>
}
