import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkArchitecture, importSpecifiers, usesProcessEnvironment } from './check-architecture.js'

test('parses re-exports and dynamic imports without treating comments or strings as dependencies', () => {
  assert.deepEqual(
    importSpecifiers(`
    // import X from '@gmod/fake'
    const text = "from '@gmod/also-fake'"
    export { value } from '@gmod/shared/value.js'
    import type { Thing } from '@gmod/schema'
    const x = import('@gmod/config')
    const y = require('@gmod/infra-redis')
  `),
    ['@gmod/shared/value.js', '@gmod/schema', '@gmod/config', '@gmod/infra-redis'],
  )
})

test('recognizes environment access and aliases while ignoring ordinary text', () => {
  assert.equal(usesProcessEnvironment("const note = 'process.env'; // process.env.TOKEN"), false)
  for (const source of [
    'process.env.TOKEN',
    "process['env'].TOKEN",
    'const { env } = process',
    "import runtime from 'node:process'; runtime.env.TOKEN",
    "import { env as environment } from 'node:process'",
  ])
    assert.equal(usesProcessEnvironment(source), true)
})

test('detects real import cycles missing from manifests and forbids reaching into another app', () => {
  const repo = mkdtempSync(resolve(tmpdir(), 'gmod-architecture-'))
  function workspace(path: string, name: string, source: string) {
    const directory = resolve(repo, path)
    mkdirSync(resolve(directory, 'src'), { recursive: true })
    writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ name }))
    writeFileSync(resolve(directory, 'src/index.ts'), source)
  }
  try {
    workspace('apps/discord', '@gmod/app-discord', '')
    workspace('packages/core', '@gmod/core', "export { thing } from '@gmod/domain-user'")
    workspace(
      'packages/domain-user',
      '@gmod/domain-user',
      "import '@gmod/core'; import '../../../apps/discord/src/index.js'",
    )
    const errors = checkArchitecture(repo)
    assert.ok(errors.some((error) => error.includes('Workspace dependency cycle:')))
    assert.ok(errors.some((error) => error.includes('imports apps/discord')))
    assert.ok(errors.some((error) => error.includes('declare @gmod/core')))
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
