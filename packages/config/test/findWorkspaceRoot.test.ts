import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findWorkspaceRoot as findWorkspaceRootIndex } from '../src/index.js'
import { findWorkspaceRoot as findWorkspaceRootWebsite } from '../src/website.js'

// Both src/index.ts and src/website.ts carry their own copy of this function — tested against
// both exports so a future fix to one doesn't quietly leave the other regressed.
const implementations = {
  'index.ts': findWorkspaceRootIndex,
  'website.ts': findWorkspaceRootWebsite,
}

describe.each(Object.entries(implementations))('findWorkspaceRoot (%s)', (_label, findWorkspaceRoot) => {
  let tempRoot: string

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('returns the start directory when its own package.json has a workspaces field', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'gmod-config-test-'))
    writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }))

    expect(findWorkspaceRoot(tempRoot)).toBe(tempRoot)
  })

  it('walks upward until it finds an ancestor package.json with a workspaces field', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'gmod-config-test-'))
    writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }))

    const nested = join(tempRoot, 'apps', 'some-app', 'src')
    mkdirSync(nested, { recursive: true })

    expect(findWorkspaceRoot(nested)).toBe(tempRoot)
  })

  it('skips an ancestor package.json that has no workspaces field', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'gmod-config-test-'))
    writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }))

    const appDir = join(tempRoot, 'apps', 'some-app')
    mkdirSync(appDir, { recursive: true })
    // A package.json without `workspaces` should be skipped, not mistaken for the root.
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'some-app' }))

    expect(findWorkspaceRoot(appDir)).toBe(tempRoot)
  })

  it('skips an ancestor package.json that is not valid JSON', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'gmod-config-test-'))
    writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }))

    const appDir = join(tempRoot, 'apps', 'some-app')
    mkdirSync(appDir, { recursive: true })
    writeFileSync(join(appDir, 'package.json'), '{ this is not valid json')

    expect(findWorkspaceRoot(appDir)).toBe(tempRoot)
  })

  it('returns the start directory unchanged when no ancestor has a workspaces field', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'gmod-config-test-'))
    const nested = join(tempRoot, 'a', 'b', 'c')
    mkdirSync(nested, { recursive: true })
    // No package.json anywhere under tempRoot: the walk reaches the filesystem root without a
    // match and falls back to the original start directory.

    expect(findWorkspaceRoot(nested)).toBe(nested)
  })
})
