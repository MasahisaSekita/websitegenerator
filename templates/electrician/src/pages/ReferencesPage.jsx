import { asset } from '../business.js'
import { copy } from '../business.js'
import { useSEO } from '../lib/useSEO.js'
import { GALLERY, GALLERY_FILTERS } from '../site.js'
import PageHero from '../components/PageHero.jsx'
import Gallery from '../components/Gallery.jsx'
import ContactSection from '../components/ContactSection.jsx'

export default function ReferencesPage() {
  useSEO({ title: copy("Inspiration | Your Company"), description: "Lighting and interior inspiration using illustrative stock photography.", path: '/inspiration', image: asset("/images/outdoor-lighting.jpg") })
  return (
    <>
      <PageHero
        image={asset("/images/outdoor-lighting.jpg")}
        imageAlt={"Electrical renovation of an open-plan kitchen, living room and bedroom"}
        crumbs={[{ label: "Home", href: '/' }, { label: "Inspiration", href: '/inspiration' }]}
        eyebrow={"Inspiration · stock photography"}
        h1={"Inspiration"}
        intro={["Explore lighting and interior inspiration. All images are illustrative stock photography."]}
      />
      <section className="px-6 sm:px-10 lg:px-16 pt-16 sm:pt-24 pb-10">
        <div className="max-w-7xl mx-auto">
          <Gallery items={GALLERY} filters={GALLERY_FILTERS} />
        </div>
      </section>
      <ContactSection />
    </>
  )
}
