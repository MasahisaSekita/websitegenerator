/* Scroll to the nearest quote form on the page (leaving room for the floating nav); fall back to the contact page. */
export function scrollToForm(navigate) {
  const target = document.getElementById('tilbud') || document.getElementById('kontakt')
  if (target) {
    const top = target.getBoundingClientRect().top + window.scrollY - 120
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    const first = target.querySelector('input:not([type=hidden])')
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 700)
    return
  }
  if (navigate) navigate('/contact')
}
