import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const configRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(configRoot, '..', '..')
const distRoot = resolve(configRoot, 'dist')
const importer = resolve(repository, 'apps/website/vite.config.ts')

/** Hide generated config output, including its node_modules symlink, without touching the worktree. */
function sourceOnlyHost(): ts.ModuleResolutionHost {
  const generated = (path: string) => {
    const canonical = ts.sys.realpath?.(path) ?? path
    return [resolve(path), resolve(canonical)].some((value) => value === distRoot || value.startsWith(distRoot + sep))
  }
  return {
    fileExists: (path) => !generated(path) && ts.sys.fileExists(path),
    readFile: (path) => (generated(path) ? undefined : ts.sys.readFile(path)),
    directoryExists: (path) => !generated(path) && ts.sys.directoryExists(path),
    realpath: ts.sys.realpath,
    getCurrentDirectory: () => repository,
  }
}

describe('website runtime package export before compilation', () => {
  it.each([
    { name: 'NodeNext', module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
    { name: 'Bundler', module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  ])('resolves the real website config import to tracked source with $name', ({ module, moduleResolution }) => {
    const result = ts.resolveModuleName(
      '@gmod/config/website-runtime.js',
      importer,
      { module, moduleResolution },
      sourceOnlyHost(),
    )
    expect(result.resolvedModule?.resolvedFileName).toBe(resolve(configRoot, 'src/website.ts'))
  })
})
