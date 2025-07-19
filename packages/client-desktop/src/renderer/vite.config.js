import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3030', // Proxy API requests to the backend
        changeOrigin: true,
        ws: true, // Also proxy WebSockets
      }
    }
  }
})