import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  server: {
    middlewareMode: false,
    middleware: [
      (req, res, next) => {
        const basePath = req.headers['x-base-path']
        console.log('[Vite Base Path Debug]', {
          originalUrl: req.url,
          basePath: basePath,
          headers: req.headers
        })
        
        if (basePath && typeof basePath === 'string') {
          // @ts-ignore - Vite's type definitions are incomplete
          req.url = basePath + req.url
          console.log('[Vite Base Path Debug] Modified URL:', req.url)
        }
        next()
      }
    ]
  }
})
