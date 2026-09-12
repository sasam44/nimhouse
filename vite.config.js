import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Nimiq Pay loads mini apps over the network, so the dev server must be
// reachable from the device (see nimiq.dev/mini-apps/development/load-local-mini-app).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Nimiq Pay (and preview proxies) may open the dev server with arbitrary
    // Host headers; allow all so the app always loads.
    allowedHosts: true,
  },
})
