import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMariaDbConfig } from '@gmod/config/infrastructure.js'

interface MigrationRecord {
  migration_name: string
  checksum: string
  finished_at: unknown
  rolled_back_at: unknown
}

/** A legacy users table alone cannot authorize writers from a new protocol release. */
export function migrationsAreCurrent(expected: Map<string, string>, records: MigrationRecord[]) {
  if (
    !expected.size ||
    records.some(
      (row) => (!row.finished_at && !row.rolled_back_at) || (!row.rolled_back_at && !expected.has(row.migration_name)),
    )
  )
    return false
  return [...expected].every(([name, checksum]) =>
    records.some(
      (row) => row.migration_name === name && row.checksum === checksum && !!row.finished_at && !row.rolled_back_at,
    ),
  )
}

export async function checkMigrationStatus() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const directory = resolve(root, 'packages/infra-prisma/migrations')
  const expected = new Map(
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => [
        entry.name,
        createHash('sha256')
          .update(readFileSync(resolve(directory, entry.name, 'migration.sql')))
          .digest('hex'),
      ]),
  )
  const mariadb = await import('mariadb')
  const database = getMariaDbConfig()
  const connection = await mariadb.createConnection({
    ...database,
    host: database.host || 'mariadb',
    connectTimeout: 5000,
  })
  try {
    const rows = await connection.query<MigrationRecord[]>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations',
    )
    return migrationsAreCurrent(expected, rows)
  } finally {
    await connection.end()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = (await checkMigrationStatus()) ? 0 : 1
  } catch {
    // Database diagnostics can contain connection strings; readiness intentionally emits none.
    process.exitCode = 1
  }
}
