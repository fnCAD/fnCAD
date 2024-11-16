import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  server: {
    middlewareMode: false,
    middleware: [
      // Add initial middleware logging
      (req, res, next) => {
        console.log('\n[Vite Middleware] Starting up...');
        next();
      },
      (req, res, next) => {
        console.log('\n[Vite Request]', new Date().toISOString());
        const basePath = req.headers['x-base-path']
        console.log('[Vite Headers]', JSON.stringify(req.headers, null, 2));
        console.log('[Vite URL]', req.url);
        
        if (basePath && typeof basePath === 'string') {
          // @ts-ignore - Vite's type definitions are incomplete
          req.url = basePath + req.url
          console.log('[Vite Modified URL]:', req.url)
        }
        next()
      }
    ]
  }
})
