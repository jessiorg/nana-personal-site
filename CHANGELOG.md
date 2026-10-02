# CHANGELOG — nana-personal-site

A record of architectural decisions, what was tried, what broke, and why things are the way they are.

---

## Simulation Stack

### LAES Energy Storage
- **Source:** Oracle VPS `/var/www/sims-hub/sim/laes/`
- **Embedding:** iframe pointing to `public/sims/laes/index.html`
- **Issue:** Buttons played sound but simulation didn't advance — mSound TypeError crash
- **Fix:** `$('mSound').querySelector(...)` threw when element absent → line removed (diffed against working `tech-twins` version)
- **Auto-start:** `speed=0` in URL → changed to `speed=1`

### Fable Refinery
- **Source:** Oracle VPS `/var/www/sims-hub/sim/refinery/` — 3319-line version with CDU, hydrocracker, wreck scenario
- **Embedding:** Same iframe pattern as LAES
- **Issue:** Wrong file initially copied (83-line stub vs 3319-line Fable Refinery)
- **Fix:** Replaced with correct file from Oracle VPS

### Eurostar Network (replaces World Rail + Supply Chain)
- **Source:** Oracle VPS `/data/tech-twins/apps/sims/eurostar/`
- **Embedding:** iframe at `public/sims/eurostar/index.html`
- **Reason for replacement:** World Rail topology fetch failing (needs base path prefix); Supply Chain also had topology issues
- **Eurostar:** Uses modern ES module Three.js (`three/addons/`) — no OrbitControls CDN breakage

### Supply Chain
- **Source:** Oracle VPS `/var/www/sims-hub/sim/supply-chain/`
- **Status:** Removed — topology fetch failing, replaced by Eurostar
- **OrbitControls fix applied:** CDN URL `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js` → 404 → copied locally

### World Rail
- **Source:** Oracle VPS `/var/www/sims-hub/sim/world-rail/`
- **Status:** Removed — topology fetch failing on GitHub Pages (relative path `topologies/world-rail.json` doesn't resolve with base path prefix)

---

## CSS / Design Token Fixes

### Vite Minifier Corrupting rgba()
- **Symptom:** NavBar glass background entirely white on GitHub Pages deployment
- **Root cause:** Vite CSS minifier corrupts `rgba(251,251,250,0.78)` → `rgba(251 251 250 0.78)` (spaces instead of commas)
- **Fix:** Added CSS variable `--nav-glass: rgba(251,251,250,0.78)` in `tokens.css`; NavBar uses `var(--nav-glass)` instead of inline rgba

### GitHub Pages Base Path
- **Symptom:** CSS 404, JS 404, iframe paths wrong on `jessiorg.github.io/nana-personal-site/`
- **Fix:** Added `base: '/nana-personal-site'` to `astro.config.mjs`

---

## Layout Fixes

### Navbar Links → Hash Anchors
- **Issue:** Navbar links pointed to `/about`, `/work`, `/writing`, `/contact` — non-existent pages
- **Fix:** Changed to `/#now`, `/#simulations`, `/#work`, `/#ventures`, `/#writing`, `/#contact`

### Navbar + Footer Width
- **Issue:** Navbar max-width 920px, Footer max-width 920px, content max-width 1080px
- **Fix:** Both updated to 1080px to match content `.wrap`

### Section Headings Squeezed
- **Issue:** `.section-head` used `grid-template-columns: 1fr 2fr` with `gap: 64px`, pushing h2 into right 1/3 column
- **Fix:** Removed grid layout from `.section-head`; h2 now spans full content width

---

## Astro Configuration

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://nana.kanay.io',
  base: '/nana-personal-site',
  build: { assets: '_astro', inlineStylesheets: 'auto' },
  output: 'static',
  compressHTML: true,
});
```

---

## Simulation Embedding Strategy

**Decision: iframe over Astro client component**

Simulations are standalone HTML files in `public/sims/{name}/`. They are embedded via:
```astro
<iframe src={`${base}/sims/{name}/index.html`} ... />
```

This avoids:
- Three.js bundling conflicts with Vite
- Module resolution issues across different three.js versions per simulation
- SSR/CSR mismatches

Trade-off: each simulation manages its own state; no shared context with the Astro host page.

---

## Three.js OrbitControls CDN Breakage

- **Symptom:** `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js` returns 404
- **Root cause:** three.js 0.160.0 moved `OrbitControls` from `examples/js/` (legacy) to `examples/jsm/` (ES module)
- **Fix options:**
  1. Use local `OrbitControls.js` file in same directory as simulation HTML
  2. Use ES module import: `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`
- Eurostar simulation uses option 2 (ES module path — works correctly)
- LAES and Refinery use local OrbitControls files

---

## Content Collections

Writing articles live in `src/content/writing/*.md` and are rendered via `src/pages/writing/[...slug].astro`.
