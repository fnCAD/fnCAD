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
      plugins: []
    },
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        // Log chunk info during build
        chunkFileNames: (chunkInfo) => {
          console.log('Creating chunk:', chunkInfo.name);
          return '[name]-[hash].js';
        },
        assetFileNames: '[name].[ext]',
        manualChunks: {
          'three': ['three'],
          'editor': ['codemirror', '@codemirror/lang-javascript'],
          'split': ['split.js'],
          'app': [
            'src/stlexporter.ts',
            'src/octree.ts',
            'src/halfedge.ts',
            'src/help-modal.ts',
            'src/cad/errors.ts',
            'src/cad/parser.ts',
            'src/cad/builtins.ts',
            'src/cad/docs.ts',
            'src/cad/types.ts',
            'src/main.ts',
            'src/state.ts',
            'src/interval.ts',
            'src/worker/mesh-worker.ts',
            'src/shader.ts',
            'src/sdf_expressions/evaluator.ts',
            'src/sdf_expressions/parser.ts',
            'src/sdf_expressions/glslgen.ts',
            'src/sdf_expressions/types.ts',
            'src/utils/runtime-base.ts',
            'src/meshgen.ts',
            'src/types.ts'
          ]
        }
      }
    },
    assetsInclude: ['/monaco-editor/**/*.worker.js'],
    manifest: true,
    sourcemap: true
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
