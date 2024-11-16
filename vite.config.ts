import { defineConfig } from 'vite'

export default defineConfig({
  base: (config) => {
    // Get base path from header in dev mode
    if (process.env.NODE_ENV === 'development') {
      return new Promise((resolve) => {
        config.server?.middlewares?.use((req, _, next) => {
          const basePath = req.headers['x-base-path']
          if (basePath && typeof basePath === 'string') {
            resolve(basePath)
          } else {
            resolve('/')
          }
          next()
        })
      })
    }
    // In production, you can set this via environment variable or hardcode it
    return process.env.BASE_PATH || '/'
  }
})
