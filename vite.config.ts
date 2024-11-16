import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  server: {
    middlewareMode: false,
    middleware: [
      (req, res, next) => {
        const basePath = req.headers['x-base-path']
        if (basePath && typeof basePath === 'string') {
          // @ts-ignore - Vite's type definitions are incomplete
          req.url = basePath + req.url
        }
        next()
      }
    ]
  }
})
