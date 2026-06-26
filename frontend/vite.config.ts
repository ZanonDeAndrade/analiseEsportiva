import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    // Honor the port injected by the preview tooling, fall back to Vite's default.
    port: Number(process.env.PORT) || 5173,
  },
})
