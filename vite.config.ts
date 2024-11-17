import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'

export default defineConfig({
  logLevel: 'info',
  clearScreen: false,
  server: {
    cors: true,
    hmr: {
      protocol: 'ws',
      timeout: 5000,
    },
  },
  base: '/~user/fncad/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1000, // Increase warning threshold to 1MB
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'monaco-core': ['monaco-editor/esm/vs/editor/editor.api'],
          'split': ['split.js'],
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
