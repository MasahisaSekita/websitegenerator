const input = window.WEBSITE_BUSINESS || {}
export const BUSINESS = {
  name: 'Your Electrical Company', phone: 'Contact us', email: 'Contact us',
  street: 'Contact us for service locations', zip: '', city: '', cvr: '', authNumber: '', ean: '',
  hours: [['Availability', 'Please contact us']], hoursNote: 'Contact us to discuss a suitable time.',
  certLine: 'Electrical services for homes and businesses.', facebook: '', facebookPageId: '', privacy: '', cookies: '', elfsightClass: '', mapQuery: '',
  ...input,
  address: [input.street, input.zip, input.city].filter(Boolean).join(', ') || 'Contact us to confirm service coverage',
  domain: window.location.origin + (window.WEBSITE_BASE || ''),
  phoneHref: input.phone ? 'tel:' + input.phone.replace(/[^+0-9]/g, '') : (window.WEBSITE_BASE || '') + '/contact',
  emailHref: input.email ? 'mailto:' + input.email : (window.WEBSITE_BASE || '') + '/contact',
}
export function copy(text) {
  return text.replaceAll('Your Company', BUSINESS.name)
    .replaceAll('Your phone', BUSINESS.phone).replaceAll('Your email', BUSINESS.email)
}

export function asset(path) { return (window.WEBSITE_BASE || "") + path }
