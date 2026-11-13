import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In dev, the sync server runs separately: npm start
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
