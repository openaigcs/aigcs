import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.PORT || '41905'}`,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
