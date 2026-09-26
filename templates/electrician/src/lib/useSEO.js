import { asset } from '../business.js'
import { useEffect } from 'react'
import { SITE } from '../site.js'

function setMeta(selector, attrs) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
    Object.entries(attrs).forEach(([k, v]) => { if (k !== 'content' && k !== 'href') el.setAttribute(k, v) })
    document.head.appendChild(el)
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
}

/* Per-route document metadata (title, description, canonical, Open Graph). */
export function useSEO({ title, description, path, image }) {
  useEffect(() => {
    const url = `${SITE.domain}${path === '/' ? '/' : path}`
    const img = `${SITE.domain}${image || asset("/images/interior.jpg")}`
    document.title = title
    setMeta('meta[name="description"]', { name: 'description', content: description || '' })
    setMeta('link[rel="canonical"]', { rel: 'canonical', href: url })
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description || '' })
    setMeta('meta[property="og:url"]', { property: 'og:url', content: url })
    setMeta('meta[property="og:image"]', { property: 'og:image', content: img })
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
  }, [title, description, path, image])
}
