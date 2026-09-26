import Reveal from '../lib/Reveal.jsx'

export default function Reviews({ dark = false, id = 'anmeldelser' }) {
  return <section id={id} className={`py-20 sm:py-28 px-6 sm:px-10 lg:px-16 ${dark ? 'bg-deep text-white' : ''}`}>
    <div className="max-w-7xl mx-auto"><Reveal>
      <h2 className="font-display font-extrabold text-4xl sm:text-5xl">Here to help</h2>
      <div className="mt-8 rounded-4xl border border-primary/20 p-10">
        <p className="text-lg">Good electrical work starts with a conversation.</p>
        <p className="mt-3 opacity-60">Tell us what you need, ask questions and discuss the next steps.</p>
      </div>
    </Reveal></div>
  </section>
}
