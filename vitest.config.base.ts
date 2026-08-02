import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config'

const repoRoot = dirname(fileURLToPath(import.meta.url))

// NOTE: `test.coverage` is a root-only option in Vitest's projects mode — it does NOT take
// effect when set here and merged into each project's config. It lives in the root
// `vitest.config.ts` instead. This file only holds the options that genuinely are
// per-project (environment, setupFiles, passWithNoTests, ...).
const baseConfig = defineConfig({
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: true,
    setupFiles: [resolve(repoRoot, 'test/setup.ts')],
  },
})

/**
 * Shared Vitest config factory for every app/package project. Each project's own
 * `vitest.config.ts` calls this (optionally with overrides) instead of duplicating
 * environment/coverage setup 22 times.
 */
export function createVitestConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  return mergeConfig(baseConfig, defineConfig(overrides))
}
