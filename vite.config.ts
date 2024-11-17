import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'

export default defineConfig({
  base: '/~user/fncad/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Ensure clean URLs work
        manualChunks: undefined
      }
    }
  },
  plugins: [{
    name: 'copy-htaccess',
    closeBundle() {
      copyFileSync('.htaccess', 'dist/.htaccess')
    }
  }]
})
