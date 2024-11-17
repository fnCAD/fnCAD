import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'

export default defineConfig({
  logLevel: 'info',
  clearScreen: false,
  build: {
    // Show detailed build progress
    reportCompressedSize: true,
    minify: 'terser',
    terserOptions: {
      format: {
        comments: true
      }
    },
    // Log each asset and its size
    manifest: true,
    // Show build time stats
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, warn) {
        // Log all rollup warnings
        console.log('Rollup warning:', warning);
        warn(warning);
      },
      output: {
        // Log chunk info during build
        chunkFileNames: (chunkInfo) => {
          console.log('Creating chunk:', chunkInfo.name);
          return '[name]-[hash].js';
        },
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
  server: {
    cors: true,
    hmr: {
      protocol: 'ws',
      timeout: 5000,
    },
  },
  base: '/~user/fncad/',
  plugins: [{
    name: 'copy-htaccess',
    closeBundle() {
      copyFileSync('.htaccess', 'dist/.htaccess')
    }
  }]
})
