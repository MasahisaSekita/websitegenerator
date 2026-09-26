import { asset } from './business.js'
import { BUSINESS } from './business.js'
export const SITE = BUSINESS


/* Primary navigation — mirrors the original site's menu hierarchy */
export const NAV = [
  { label: "Home", href: '/' },
  {
    label: "Services",
    href: '/services',
    children: [
      { label: "Electrical repairs", href: '/electrical-repairs', blurb: "Contact us to discuss your requirements." },
      {
        label: "Electrical installation",
        href: '/electrical-installation',
        blurb: "Lighting, sockets and new installations",
        children: [
          { label: "RCD safety switch", href: '/rcd-protection' },
          { label: "Electrical enclosure installation", href: '/electrical-enclosures' },
          { label: "Consumer unit replacement", href: '/consumer-units' },
        ],
      },
      {
        label: "Electrical renovation",
        href: '/rewiring',
        blurb: "From old to new — throughout your home",
        children: [
          { label: "Electrical contracting", href: '/electrical-contracting' },
          { label: "Extensions", href: '/extensions' },
          { label: "Full renovation", href: '/renovations' },
        ],
      },
      { label: "Electrical maintenance", href: '/maintenance', blurb: "Reliable power every day" },
      { label: "EV charger", href: '/ev-charging', blurb: "EV chargers — properly installed" },
    ],
  },
  { label: "Prices", href: '/pricing' },
  { label: "Inspiration", href: '/inspiration' },
  { label: "About", href: '/about' },
  { label: "Contact", href: '/contact' },
]

/* Footer menu — identical items/labels to the original footer (legacy hrefs resolved to their redirect targets) */
export const FOOTER_MENU = [
  { label: "Home", href: '/' },
  { label: "Services", href: '/services' },
  { label: "Full renovation", href: '/renovations' },
  { label: "Electrical repairs", href: '/electrical-repairs' },
  { label: "Electrical installation", href: '/electrical-installation' },
  { label: "Electrician", href: '/maintenance' },
  { label: "EV charging stations", href: '/ev-charging' },
  { label: "Inspiration", href: '/inspiration' },
  { label: "Extensions", href: '/extensions' },
  { label: "Prices", href: '/pricing' },
  { label: "Contact", href: '/contact' },
]

/* Local landing pages */
export const AREAS = { elektriker: [{label: 'Local electrical services', href: '/contact'}], installatoer: [], renovering: [] }

/* The six service cards from the original front page (labels, blurbs, images and targets verbatim) */
export const HOME_SERVICES = [
  {
    title: "Electrical repairs",
    text: "Quick help in case of sudden failure, power failure or urgent electrical problems at home.",
    href: '/electrical-repairs',
    image: asset("/images/panel-testing.jpg"),
    alt: "Electrical panel testing — stock photograph",
    icon: 'Siren',
  },
  {
    title: "Extensions",
    text: "Correct and secure electrical installations for new spaces and extensions of the dwelling.",
    href: '/extensions',
    image: asset("/images/house-dusk.jpg"),
    alt: "A home illuminated at dusk — stock photograph",
    icon: 'HousePlus',
  },
  {
    title: "Full renovation",
    text: "Updating and replacing electrical installations as part of a total renovation of housing.",
    href: '/renovations',
    image: asset("/images/interior.jpg"),
    alt: "Renovated kitchen interior — stock photograph",
    icon: 'Hammer',
  },
  {
    title: "Electrical maintenance",
    text: "Professional solid electrical work for private customers, carried out with a focus on quality and safety.",
    href: '/maintenance',
    image: asset("/images/electrician.jpg"),
    alt: "Electrician with tools — stock photograph",
    icon: 'Wrench',
  },
  {
    title: "EV chargers",
    text: "Setting up and connecting EV chargers to private homes with correct installation.",
    href: '/ev-charging',
    image: asset("/images/ev-charging.jpg"),
    alt: "Electric vehicle charging — stock photograph",
    icon: 'BatteryCharging',
  },
  {
    title: "Electrical installation",
    text: "Professional electrical installations for both smaller tasks and larger solutions in the home.",
    href: '/electrical-installation',
    image: asset("/images/cafe-lighting.jpg"),
    alt: "Decorative pendant lighting — stock photograph",
    icon: 'Plug',
  },
]

/* Project gallery (from /inspiration) */
export const GALLERY = [
  { src: asset("/images/pendant.jpg"), alt: "Minimal pendant lighting — stock photograph", category: "Lighting" },
  { src: asset("/images/outdoor-lighting.jpg"), alt: "Garden and exterior lighting — stock photograph", category: "Exteriors" },
  { src: asset("/images/lamp-detail.jpg"), alt: "Sculptural lamp detail — stock photograph", category: "Lighting" },
  { src: asset("/images/interior.jpg"), alt: "Kitchen lighting inspiration — stock photograph", category: "Interiors" },
  { src: asset("/images/ev-charging.jpg"), alt: "Electric vehicle charging — stock photograph", category: "EV charging" },
  { src: asset("/images/cafe-lighting.jpg"), alt: "Glass pendant lights — stock photograph", category: "Lighting" },
  { src: asset("/images/house-dusk.jpg"), alt: "A home at dusk — stock photograph", category: "Exteriors" },
]
export const GALLERY_FILTERS = ["All", "Lighting", "Interiors", "Exteriors", "EV charging"]

export const TRUST_STATS = [
  { value: 'Care', label: 'in every detail' },
  { value: 'Quality', label: 'workmanship' },
  { value: 'Clear', label: 'communication' },
  { value: 'Local', label: 'service' },
]

export const BADGES = []

/* Old-site paths that 301'd — preserved as client-side redirects */
export const REDIRECTS = {}
