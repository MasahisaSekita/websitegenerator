import { SITE } from '../site.js'
/* New brand lockup: gradient tile with house outline + amber bolt, wordmark beside it. */
export function LogoMark({ className = 'h-9 w-9', id = 'lm' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--theme-primary))" />
          <stop offset="1" stopColor="rgb(var(--theme-primary-dark))" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${id}-bg)`} />
      <path d="M11 23.5 24 12l13 11.5M14 21.5V37h20V21.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25.6 19.5 20 28.5h5l-1.6 8L30 26.5h-5.2z" fill="rgb(var(--theme-accent))" />
    </svg>
  )
}

export default function Logo({ tone = 'light', size = 'md', className = '' }) {
  const text = tone === 'light' ? 'text-white' : 'text-ink'
  const lg = size === 'lg'
  return (
    <span className={`inline-flex items-center align-middle gap-2.5 ${className}`}>
      <LogoMark className={lg ? 'h-11 w-11 shrink-0' : 'h-9 w-9 shrink-0'} id={`lm-${tone}-${size}`} />
      <span className="flex flex-col leading-none min-w-0 max-w-[160px] sm:max-w-[230px] break-words">
        <span className={`font-display font-extrabold tracking-tight ${lg ? 'text-xl' : 'text-[17px]'} leading-none ${text} transition-colors duration-300`}>
          {SITE.name}
        </span>
      </span>
    </span>
  )
}

/* Oversized outlined mark used as the hero backdrop: draws itself in, then a current runs along the outline. */
export function HeroMark({ className = '' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hm-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--theme-primary-light))" />
          <stop offset="1" stopColor="rgb(var(--theme-primary))" />
        </linearGradient>
        <radialGradient id="hm-glow" cx="50%" cy="55%" r="50%">
          <stop offset="0" stopColor="rgb(var(--theme-accent))" stopOpacity="0.55" />
          <stop offset="1" stopColor="rgb(var(--theme-accent))" stopOpacity="0" />
        </radialGradient>
        <filter id="hm-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      {/* soft outline */}
      <path d="M11 23.5 24 12l13 11.5M14 21.5V37h20V21.5" fill="none" stroke="url(#hm-stroke)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" pathLength="100" className="hm-draw" opacity="0.42" />
      {/* travelling current */}
      <path d="M11 23.5 24 12l13 11.5M14 21.5V37h20V21.5" fill="none" stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" pathLength="100" className="hm-flow" opacity="0.9" />
      <path d="M11 23.5 24 12l13 11.5M14 21.5V37h20V21.5" fill="none" stroke="rgb(var(--theme-primary-light))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" pathLength="100" className="hm-flow" opacity="0.35" filter="url(#hm-blur)" />
      {/* bolt */}
      <circle cx="25" cy="29" r="11" fill="url(#hm-glow)" className="hm-pulse" />
      <path d="M25.6 19.5 20 28.5h5l-1.6 8L30 26.5h-5.2z" fill="rgb(var(--theme-accent))" opacity="0.85" className="hm-pulse" />
    </svg>
  )
}
