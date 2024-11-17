import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'

export default defineConfig({
  base: '/~user/fncad/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1000, // Increase warning threshold to 1MB
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': [
            'three',
            'monaco-editor',
            'split.js'
          ],
          'core': [
            './src/parser.ts',
            './src/evaluator.ts',
            './src/ast.ts'
          ],
          'rendering': [
            './src/shader.ts',
            './src/octree.ts',
            './src/octreevis.ts',
            './src/meshgen.ts'
          ]
        }
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
