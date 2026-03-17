import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: process.env.CAPACITOR_BUILD ? './' : '/my/',
  build: {
    outDir: process.env.CAPACITOR_BUILD
      ? path.resolve(__dirname, 'ios-dist')
      : path.resolve(__dirname, '..', 'public', 'my'),
    emptyOutDir: true,
    sourcemap: 'hidden',
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3900',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:3900',
        changeOrigin: true,
      },
    },
  },
})
