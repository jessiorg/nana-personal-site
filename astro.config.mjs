import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nana.kanay.io',
  base: '/nana-personal-site',
  build: {
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  output: 'static',
  compressHTML: true,
});
