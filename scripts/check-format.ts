import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { check, getFileInfo, resolveConfig } from 'prettier'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
process.chdir(repoRoot)
// CI supplies the base commit. Locally check tracked changes plus new files.
const base = process.argv[2]
const diff = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z', base || 'HEAD', '--'], {
  encoding: 'utf8',
})
// Keep unrelated untracked deployments and local state outside this application check.
// Any file added to Git is still checked through `diff`, regardless of its directory.
const untracked = base
  ? []
  : execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter((file) => !file.includes('/') || /^(apps|packages|scripts|\.github|docs)\//.test(file))
const files = [...new Set([...diff.split('\0'), ...untracked].filter(Boolean))]
let failed = false
let checked = 0
for (const file of files) {
  if (!existsSync(file)) continue
  const info = await getFileInfo(file, { ignorePath: ['.prettierignore', '.gitignore'] })
  if (info.ignored || !info.inferredParser) continue
  checked++
  if (!(await check(readFileSync(file, 'utf8'), { ...(await resolveConfig(file)), filepath: file }))) {
    console.error(`Formatting differs: ${file}`)
    failed = true
  }
}
console.log(`Checked formatting for ${checked} changed files.`)
process.exitCode = failed ? 1 : 0
