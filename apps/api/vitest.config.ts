import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../vitest.config.base.js'

// This app's source uses the `@/*` -> `./src/*` path alias (see tsconfig.json). Bun resolves
// that natively at runtime, but Vitest goes through Vite's resolver, which needs it spelled
// out explicitly here.
export default createVitestConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
