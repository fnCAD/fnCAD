import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  logLevel: 'info',
  clearScreen: false,
  build: {
    reportCompressedSize: true,
    minify: 'esbuild',
    target: 'esnext',
    worker: {
      format: 'es',
      plugins: [],
      rollupOptions: {
        output: {
          format: 'amd'
        }
      }
    },
    // Log each asset and its size
    manifest: true,
    // Show build time stats
    sourcemap: true,
    rollupOptions: {
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
            './src/sdf_expressions/parser.ts',
            './src/sdf_expressions/evaluator.ts',
            './src/sdf_expressions/ast.ts',
            './src/cad/parser.ts',
            './src/cad/types.ts',
            './src/cad/builtins.ts',
            './src/cad/errors.ts'
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
  base: './',
  plugins: [{
    name: 'copy-htaccess',
    closeBundle() {
      copyFileSync('.htaccess', 'dist/.htaccess')
    }
  }]
})
