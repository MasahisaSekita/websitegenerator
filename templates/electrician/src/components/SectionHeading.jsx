import Reveal from '../lib/Reveal.jsx'

/* Eyebrow + display heading + optional serif italic flourish + lead text. */
export default function SectionHeading({ eyebrow, title, flourish, lead, align = 'left', dark = false, as: Tag = 'h2', className = '' }) {
  const center = align === 'center'
  return (
    <Reveal className={`${center ? 'text-center mx-auto' : ''} max-w-3xl ${className}`}>
      {eyebrow && (
        <span className={`inline-block font-mono text-[11px] sm:text-xs uppercase tracking-[0.28em] ${dark ? 'text-primary-light' : 'text-primary-dark'}`}>
          ╱ {eyebrow}
        </span>
      )}
      <Tag className={`font-display font-extrabold text-4xl sm:text-5xl md:text-6xl mt-4 leading-[1.04] tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
        {title}
        {' '}
        {flourish && (
          <span className={`block font-serif italic font-medium mt-1 ${dark ? 'text-primary-light' : 'text-primary-dark'}`}>
            {flourish}
          </span>
        )}
      </Tag>
      {lead && (
        <p className={`mt-6 text-base sm:text-lg leading-relaxed ${dark ? 'text-white/65' : 'text-muted'} ${center ? 'mx-auto' : ''} max-w-2xl`}>
          {lead}
        </p>
      )}
    </Reveal>
  )
}
