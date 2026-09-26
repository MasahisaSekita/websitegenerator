import { useEffect } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { REDIRECTS } from './site.js'
import ScrollToTop from './lib/ScrollToTop.jsx'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import MobileCallBar from './components/MobileCallBar.jsx'
import HomePage from './pages/HomePage.jsx'
import ContentPage from './pages/ContentPage.jsx'
import PricesPage from './pages/PricesPage.jsx'
import ReferencesPage from './pages/ReferencesPage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import ServicesPage from './pages/ServicesPage.jsx'
import NotFound from './pages/NotFound.jsx'

gsap.registerPlugin(ScrollTrigger)

/* Every transcribed page module registers its own route by `path` */
const contentModules = import.meta.glob('./content/*.js', { eager: true })
export const CONTENT_PAGES = Object.values(contentModules).map((m) => m.default).filter((p) => p && p.path)

function Layout() {
  useEffect(() => {
    const t1 = setTimeout(() => ScrollTrigger.refresh(), 200)
    const t2 = setTimeout(() => ScrollTrigger.refresh(), 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  return (
    <div className="relative">
      <div className="noise-overlay" />
      <ScrollToTop />
      <Navbar />
      <main className="pb-20 lg:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileCallBar />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/pricing" element={<PricesPage />} />
        <Route path="/inspiration" element={<ReferencesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {CONTENT_PAGES.map((p) => (
          <Route key={p.path} path={p.path} element={<ContentPage data={p} />} />
        ))}
        {Object.entries(REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
