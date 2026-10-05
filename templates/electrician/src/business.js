const input = window.WEBSITE_BUSINESS || {}
// A single-file export (quick_site.py bundle) opens from disk, where only hash routes resolve.
const contactHref = window.WEBSITE_SINGLE_FILE ? '#/contact' : (window.WEBSITE_BASE || '') + '/contact'
export const BUSINESS = {
  name: 'Your Electrical Company', phone: 'Contact us', email: 'Contact us',
  street: 'Contact us for service locations', zip: '', city: '', cvr: '', authNumber: '', ean: '',
  hours: [['Availability', 'Please contact us']], hoursNote: 'Contact us to discuss a suitable time.',
  certLine: 'Electrical services for homes and businesses.', facebook: '', facebookPageId: '', privacy: '', cookies: '', elfsightClass: '', mapQuery: '',
  ...input,
  address: [input.street, input.zip, input.city].filter(Boolean).join(', ') || 'Contact us to confirm service coverage',
  domain: window.location.origin + (window.WEBSITE_BASE || ''),
  phoneHref: input.phone ? 'tel:' + input.phone.replace(/[^+0-9]/g, '') : contactHref,
  emailHref: input.email ? 'mailto:' + input.email : contactHref,
}
export function copy(text) {
  return text.replaceAll('Your Company', BUSINESS.name)
    .replaceAll('Your phone', BUSINESS.phone).replaceAll('Your email', BUSINESS.email)
}

// A single-file export embeds every image in window.WEBSITE_ASSETS, keyed by its public path.
export function asset(path) { return (window.WEBSITE_ASSETS && window.WEBSITE_ASSETS[path]) || (window.WEBSITE_BASE || "") + path }
