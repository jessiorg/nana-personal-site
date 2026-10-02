# nana-personal-site

Personal site for Nana Gyasi — Founder & CEO, Kanay.

Built with [Astro](https://astro.build) and [OpenDesign](https://open.design).

## Stack

- **Astro 4** — static site generation with content collections
- **React** — interactive simulation components
- **Three.js** — energy system simulation visualisations
- **OpenDesign** — design tokens and visual design system

## Design Tokens

Tokens live in `src/styles/tokens.css`. They are the canonical source,
exported from the OpenDesign project `nana-personal-site.html`.

## Simulations

`src/components/sims/` — Three.js simulations embedded as React components
with `client:only`. Each sim inherits the site layout and design tokens.

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

Output is static — deploy to any CDN or GitHub Pages.

## Content

Markdown pages go in `src/pages/` or use Astro Content Collections
in `src/content/`.
