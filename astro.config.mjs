import { defineConfig } from 'astro/config';

// Static output only: the Dashboard is rendered once at build time from Full Refresh data.
export default defineConfig({
  output: 'static',
});
