import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 22064,
    proxy: {
      '/api': 'http://localhost:12064',
      '/health': 'http://localhost:12064',
    },
  },
})
