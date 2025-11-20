import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/process_data': {
        target: 'http://98.94.158.206:3000',
        changeOrigin: true,
      },
    },
  }
})

