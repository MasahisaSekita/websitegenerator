/* Prerender every route of the built site into dist/<route>/index.html using the local Chrome.
   Usage: npm run build && node scripts/prerender.mjs   (or: npm run build:static) */
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import puppeteer from 'puppeteer-core'

const DIST = 'dist'
const PORT = 4173
const routes = JSON.parse(readFileSync('scripts/routes.json', 'utf8'))
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' }

if (!existsSync(CHROME)) { console.error(`Chrome not found at ${CHROME} — set CHROME_PATH`); process.exit(1) }

const server = createServer((req, res) => {
  let file = join(DIST, decodeURIComponent(req.url.split('?')[0]))
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream')
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.setRequestInterception(true)
page.on('request', (req) => {
  // third-party widgets are loaded live in the browser; skip them while snapshotting
  const u = req.url()
  if (/elfsight|facebook|google\.com\/maps|fbcdn/.test(u)) return req.abort()
  req.continue()
})

let ok = 0
for (const route of routes) {
  const url = `http://localhost:${PORT}${route}`
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('main h1', { timeout: 20000 })
    await new Promise((r) => setTimeout(r, 2500))
    await page.evaluate(() => {
      document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible'))
      document.querySelectorAll('[style*="opacity"]').forEach((e) => { e.style.opacity = ''; e.style.transform = '' })
      document.querySelectorAll('script[data-elfsight-platform]').forEach((e) => e.remove())
    })
    const html = await page.content()
    const out = route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, '<!doctype html>\n' + html.replace(/^<!doctype html>\s*/i, ''))
    ok += 1
    console.log('✓', route)
  } catch (err) {
    console.error('✗', route, err.message)
  }
}
await browser.close()
server.close()
console.log(`Prerendered ${ok}/${routes.length} routes into ${DIST}/`)
process.exit(ok === routes.length ? 0 : 1)
