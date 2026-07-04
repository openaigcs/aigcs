import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: { port: 5175 },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/lite.ts'),
      formats: ['iife'],
      name: 'AIGCS',
      fileName: () => 'aigcs-lite.js',
    },
    rollupOptions: {
      output: {
        exports: 'default',
      },
    },
    sourcemap: true,
  },
})
