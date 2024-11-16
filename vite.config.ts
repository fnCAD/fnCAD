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
        const fs = require('fs');
        const timestamp = new Date().toISOString();
        const debugInfo = `
[Vite Request] ${timestamp}
[Vite Headers] ${JSON.stringify(req.headers, null, 2)}
[Vite URL] ${req.url}
`;
        fs.appendFileSync('/tmp/vite-debug.log', debugInfo);
        
        const basePath = req.headers['x-base-path']
        if (basePath && typeof basePath === 'string') {
          // @ts-ignore - Vite's type definitions are incomplete
          req.url = basePath + req.url
          fs.appendFileSync('/tmp/vite-debug.log', `[Vite Modified URL]: ${req.url}\n`);
        }
        next()
      }
    ]
  }
})
