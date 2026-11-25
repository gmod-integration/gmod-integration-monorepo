import { spawnSync } from 'node:child_process'
import { getMariaDbConfig } from '@gmod/config/infrastructure.js'

// Encode credentials rather than interpolating them into a shell command or URL string.
const url = new URL('mysql://mariadb:3306')
const database = getMariaDbConfig()
url.hostname = database.host || 'mariadb'
url.port = String(database.port)
url.username = database.user || ''
url.password = database.password || ''
url.pathname = '/' + (database.database || '')
const result = spawnSync(process.execPath, ['run', 'prisma:migrate:prod'], {
  env: { ...process.env, MARIA_URL: url.href },
  stdio: 'inherit',
})
process.exitCode = result.status ?? 1
