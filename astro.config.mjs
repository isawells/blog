// @ts-check
import { defineConfig } from 'astro/config';

// SITE and BASE_PATH are injected by the GitHub Pages workflow
// (from actions/configure-pages), so no repo-specific config lives here.
export default defineConfig({
  site: process.env.SITE ?? 'http://localhost:4321',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
});
