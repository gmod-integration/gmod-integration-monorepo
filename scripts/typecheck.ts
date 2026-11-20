import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const projects = [
  ['Backend and shared packages', 'tsconfig.typecheck.json'],
  ['Website source, tests and configuration', 'apps/website/tsconfig.json'],
  ['Documentation website', 'apps/docs/tsconfig.json'],
] as const

let failed = false
for (const [label, project] of projects) {
  console.log(`\nTypechecking ${label}`)
  const result = spawnSync(process.execPath, ['run', 'tsc', '--noEmit', '--project', project], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error.message)
  if (result.error || result.status !== 0) failed = true
}

process.exitCode = failed ? 1 : 0
