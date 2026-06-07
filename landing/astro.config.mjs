// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://vibeflow-landing.web.app',
  integrations: [sitemap()],
  // Static output (default). Build emits to ./dist.
  build: {
    inlineStylesheets: 'auto',
  },
});
