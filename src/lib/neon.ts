import { createClient } from '@neondatabase/neon-js'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL

if (!authUrl || !dataApiUrl) {
  throw new Error(
    'Missing VITE_NEON_AUTH_URL or VITE_NEON_DATA_API_URL. Copy .env.example to .env and fill them in.',
  )
}

export const neon = createClient({
  auth: {
    url: authUrl,
    // Signed-out visitors get an anonymous token, so RLS lets them read
    // exams and published questions.
    allowAnonymous: true,
  },
  dataApi: {
    url: dataApiUrl,
  },
})
