import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Tests run in Node without .env or the network: the setup file swaps the
    // Neon client for a stand-in that fails any test that calls it.
    setupFiles: ['src/test/setup.ts'],
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries get their own chunks, so a deploy that changes only app
        // code leaves them cached in the browser.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'router', test: /node_modules[\\/](react-router|react-router-dom)[\\/]/, priority: 2 },
            // @neondatabase/neon-js and what it pulls in (Neon Auth, PostgREST).
            { name: 'neon', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
})
