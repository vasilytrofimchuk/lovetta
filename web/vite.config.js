import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/my/',
  build: {
    outDir: path.resolve(__dirname, '..', 'public', 'my'),
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
    },
  },
})
