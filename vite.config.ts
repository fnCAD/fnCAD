import { defineConfig } from 'vite'

export default defineConfig({
  base: '/fncad/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
})
