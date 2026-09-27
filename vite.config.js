import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: the same build works at a domain root (Vercel) and
  // under any sub-path (previews, a /twin/ route on the STS site).
  base: './',
  build: {
    rolldownOptions: {
      output: {
        // Split the heavy, rarely-changing 3D stack out of the app chunk so
        // app deploys don't bust the cached three.js download.
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|troika|camera-controls|maath|meshline|zustand|its-fine|suspend-react)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
    // three.js alone is ~700 kB minified; that's expected for a 3D app.
    chunkSizeWarningLimit: 800,
  },
})
