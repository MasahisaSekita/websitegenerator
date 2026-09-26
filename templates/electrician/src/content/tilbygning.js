import { asset } from '../business.js'
import { copy } from '../business.js'
export default {
  "path": "/extensions",
  "title": copy("Extensions | Your Company"),
  "description": "Discuss extensions for your home or business. Contact us to talk through your requirements.",
  "h1": "Extensions",
  "heroImage": asset("/images/house-dusk.jpg"),
  "heroImageAlt": "Electrical services inspiration — stock photograph",
  "heroImages": [
    asset("/images/house-dusk.jpg")
  ],
  "intro": [
    "Planning extensions? Tell us about your property, the work you have in mind and your preferred timing. We can discuss the next steps together."
  ],
  "heroCtas": [
    {
      "label": "Discuss your project",
      "href": "/contact"
    }
  ],
  "blocks": [
    {
      "type": "h2",
      "text": "A practical approach to your project"
    },
    {
      "type": "p",
      "md": "Every property is different. The starting point is understanding your existing installation, how you use the space and what you would like to change."
    },
    {
      "type": "ul",
      "items": [
        "Describe the work and any existing issues.",
        "Discuss access, timing and your preferred outcome.",
        "Ask about the scope, materials and a written quotation."
      ]
    },
    {
      "type": "img",
      "src": asset("/images/lamp-detail.jpg"),
      "alt": "Decorative lamp detail — illustrative stock photography"
    },
    {
      "type": "h2",
      "text": "Plan the details before work begins"
    },
    {
      "type": "p",
      "md": "Contact us to confirm whether this service is suitable for your property, along with availability and any assessment needed before quoting."
    },
    {
      "type": "faq",
      "items": [
        {
          "q": "How do I request a quote?",
          "a": "Call or email with a short description of the work and your contact details."
        },
        {
          "q": "How much will the work cost?",
          "a": "The cost depends on the scope, materials and condition of the existing installation. Ask for a quote for your specific project."
        }
      ]
    },
    {
      "type": "contact"
    }
  ]
}
