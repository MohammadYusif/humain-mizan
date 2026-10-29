import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: '../web',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Split stable vendor code from app code: better caching, and no chunk over the 500 kB warning.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'ui-vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    // Exact API prefixes only: '/run' must not swallow '/runs', and the SPA owns every other path.
    proxy: Object.fromEntries(
      ['run', 'runs', 'contracts', 'playbook', 'healthz', 'batches', 'inbox', 'evals', 'demo', 'insights'].map((p) => [
        `^/${p}(/|\\?|$)`,
        api,
      ])
    ),
  },
})
