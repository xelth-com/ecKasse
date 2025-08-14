import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@eckasse/shared-frontend': path.resolve(__dirname, '../../shared-frontend')
    }
  },
  build: {
    emptyOutDir: true
  }
})