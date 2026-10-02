import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nana.kanay.io',
  output: 'static',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
});
