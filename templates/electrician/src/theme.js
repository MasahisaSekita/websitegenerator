// One input color drives the shared palette, including SVGs and animations.
const supplied = window.WEBSITE_BUSINESS?.theme_color
const hex = /^#[0-9a-f]{6}$/i.test(supplied || '') ? supplied : '#7cc0f7'
const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16))
const mix = (color, target, amount) => color.map((n, i) => Math.round(n + (target[i] - n) * amount))
const luminance = color => color.map(n => {const c=n/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}).reduce((s,n,i)=>s+n*[0.2126,0.7152,0.0722][i],0)
let dark = rgb
while (luminance(dark) > 0.16) dark = mix(dark, [0,0,0], 0.1)
let light = rgb
while (luminance(light) < 0.55) light = mix(light, [255,255,255], 0.12)
const colors = {primary:rgb, 'primary-dark':dark, 'primary-light':light, accent:light, 'accent-dark':dark}
for (const [key,color] of Object.entries(colors)) document.documentElement.style.setProperty('--theme-'+key,color.join(' '))
const foreground = luminance(rgb)>0.179 ? '#000000' : '#ffffff'
document.documentElement.style.setProperty('--theme-on-primary',foreground)
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',hex)

const icon = document.querySelector('link[rel="icon"]')
if (icon) icon.href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="${hex}"/><path d="M27 7 14 27h10l-3 14 14-23H25z" fill="${foreground}"/></svg>`)
