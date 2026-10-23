import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
