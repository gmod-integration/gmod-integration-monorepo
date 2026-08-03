import { fileURLToPath } from 'node:url'
import solidPlugin from 'vite-plugin-solid'
import { createVitestConfig } from '../../vitest.config.base.js'

// Phase 8: real component tests. `__GMI_WEBSITE_CONFIG__`/`__BUILD_DATE__` are normally
// injected by this app's own vite.config.ts `define` block (from real @gmod/config values at
// build time) - tests need the same globals defined with fixed dummy values instead, since
// nothing here goes through that build step. Individual test files that need a different
// WEBSITE_CONFIG shape (e.g. dev: true) mock '../config.js' directly rather than relying on
// this default.
export default createVitestConfig({
  plugins: [solidPlugin()],
  resolve: {
    conditions: ['browser', 'development'],
  },
  ssr: {
    resolve: {
      conditions: ['browser', 'development'],
    },
    noExternal: ['solid-js', '@solidjs/testing-library', '@solidjs/router'],
  },
  define: {
    __BUILD_DATE__: JSON.stringify('test-build-date'),
    __GMI_WEBSITE_CONFIG__: JSON.stringify({
      dev: false,
      devShowMissingTranslations: false,
      apiUrl: 'http://localhost:5001',
      wsUrl: 'ws://localhost:5002',
      discordClientId: 'test-discord-client-id',
      websiteUrl: 'http://localhost:3000',
    }),
  },
  test: {
    environment: 'happy-dom',
    setupFiles: [fileURLToPath(new URL('./test/setup.ts', import.meta.url))],
  },
})
