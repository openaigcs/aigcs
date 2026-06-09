import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5175 },
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      name: 'AIGCS',
      formats: ['iife'],
      fileName: () => 'aigcs.js',
    },
    rollupOptions: {
      output: {
        exports: 'default',
      },
    },
    sourcemap: true,
  },
})
