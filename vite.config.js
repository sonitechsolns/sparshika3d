import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Absolute asset URLs for the real site, so deep links like
  // /app/settings/agents load /assets/… (a relative base would look under
  // /app/settings/assets/ and render a blank page). Preview builds are hosted
  // at a fixed page URL with hash routing, so they use relative URLs.
  base: process.env.VITE_MOCK_API === '1' ? './' : '/',
  // Same-origin API in dev, exactly like production's Vercel rewrite, so the
  // session cookie behaves identically. Start the API on :8010 (see README).
  server: { proxy: { '/api': 'http://127.0.0.1:8010' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8010' } },
  build: {
    rolldownOptions: {
      output: {
        // Split the heavy, rarely-changing 3D stack out of the app chunk so
        // app deploys don't bust the cached three.js download.
        advancedChunks: {
          groups: [
            // React + router first (highest priority) so pages that don't
            // show the 3D twin never download three.js.
            { name: 'react', priority: 30, test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/ },
            { name: 'three', priority: 20, test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', priority: 10, test: /node_modules[\\/](@react-three|three-stdlib|troika|camera-controls|maath|meshline|zustand|its-fine|suspend-react|react-reconciler|react-use-measure|@use-gesture|tunnel-rat|hls\.js|stats|detect-gpu|@monogrid|webgl)/ },
          ],
        },
      },
    },
    // three.js alone is ~700 kB minified; that's expected for a 3D app.
    chunkSizeWarningLimit: 800,
  },
})
