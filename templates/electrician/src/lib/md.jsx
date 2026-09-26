import { Link } from 'react-router-dom'

/* Tiny inline-markdown renderer: [text](href), **bold**, _italic_ / *italic*, and \escapes. */
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const EMPH_RE = /(\*\*[^*]+\*\*|_[^_\n]+_|\*[^*\n]+\*)/g

function unescape(s) {
  return s.replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')
}

function inline(text, key) {
  const out = []
  let last = 0
  let m
  let i = 0
  EMPH_RE.lastIndex = 0
  while ((m = EMPH_RE.exec(text))) {
    if (m.index > last) out.push(unescape(text.slice(last, m.index)))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={`${key}-b${i}`}>{unescape(t.slice(2, -2))}</strong>)
    else out.push(<em key={`${key}-i${i}`}>{unescape(t.slice(1, -1))}</em>)
    last = m.index + t.length
    i += 1
  }
  if (last < text.length) out.push(unescape(text.slice(last)))
  return out
}

export function renderMd(md, key = 'md') {
  if (!md) return null
  const nodes = []
  let last = 0
  let m
  let i = 0
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(md))) {
    if (m.index > last) nodes.push(...inline(md.slice(last, m.index), `${key}-t${i}`))
    const [, label, href] = m
    const k = `${key}-l${i}`
    if (href.startsWith('/')) {
      nodes.push(<Link key={k} to={href}>{inline(label, k)}</Link>)
    } else {
      const external = href.startsWith('http')
      nodes.push(
        <a key={k} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {inline(label, k)}
        </a>
      )
    }
    last = m.index + m[0].length
    i += 1
  }
  if (last < md.length) nodes.push(...inline(md.slice(last), `${key}-t${i}`))
  return nodes
}

export function Md({ children, as: Tag = 'p', className = '' }) {
  return <Tag className={className}>{renderMd(children)}</Tag>
}
