import solidPlugin from 'vite-plugin-solid'
import { createVitestConfig } from '../../vitest.config.base.js'

// Minimal standalone config for now (Phase 0: just registers this project in the workspace so
// `bun run test` discovers it, with 0 tests passing via passWithNoTests). Phase 8 (apps/website
// component tests) should revisit whether to pull in the app's own vite.config.ts (its
// `define` globals, Sentry plugin) once real tests need them.
export default createVitestConfig({
  plugins: [solidPlugin()],
  test: {
    environment: 'happy-dom',
  },
})
