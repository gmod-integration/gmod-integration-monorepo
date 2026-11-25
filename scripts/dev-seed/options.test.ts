import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertDevSeedTarget, parseDevSeedOptions, selectSeedOwner } from './options.js'

const guildId = '1051881514020917408'
const ownerId = '333650866747867137'

test('parses developer IDs and preview/help options with an optional command separator', () => {
  assert.deepEqual(parseDevSeedOptions([]), {
    guildId: undefined,
    ownerDiscordId: undefined,
    dryRun: false,
    discord: false,
    help: false,
  })
  assert.deepEqual(parseDevSeedOptions(['--', '--guild-id', guildId, `--owner-id=${ownerId}`, '--dry-run']), {
    guildId,
    ownerDiscordId: ownerId,
    dryRun: true,
    discord: false,
    help: false,
  })
  assert.equal(parseDevSeedOptions(['--help']).help, true)
  assert.equal(parseDevSeedOptions(['--discord']).discord, true)
})

test('rejects unknown arguments, missing option values and malformed Discord IDs', () => {
  for (const args of [
    ['--unknown'],
    ['unexpected'],
    ['--guild-id'],
    ['--owner-id'],
    ['--guild-id', '123'],
    ['--owner-id', 'not-a-discord-id'],
    ['--guild-id', '123456789012345678901'],
    ['--owner-id', '-333650866747867137'],
    ['--guild-id', '12345678901234567extra'],
    ['--dry-run=false'],
  ]) {
    assert.throws(() => parseDevSeedOptions(args))
  }
})

test('refuses seeding outside development before considering connection targets', () => {
  assert.throws(
    () => assertDevSeedTarget({ dev: false, mariaHost: 'localhost', mongoUri: 'mongodb://localhost' }),
    /DEV=true/,
  )
})

test('accepts local MariaDB and MongoDB endpoints including Docker aliases and IPv6', () => {
  for (const mariaHost of [
    'localhost',
    '127.0.0.1',
    '::1',
    '[::1]',
    'mariadb',
    'mysql',
    'db',
    'host.docker.internal',
  ]) {
    assertDevSeedTarget({ dev: true, mariaHost, mongoUri: 'mongodb://localhost:27017/gmod_integration' })
  }
  for (const mongoUri of [
    'mongodb://localhost',
    'mongodb://127.0.0.1:27017/gmod_integration',
    'mongodb://[::1]:27017/',
    'mongodb://mongo:27017,mongodb:27018/?replicaSet=local',
    'mongodb://host.docker.internal:27017',
    'mongodb://local-user:encoded%40password@localhost:27017/?authSource=admin',
  ]) {
    assertDevSeedTarget({ dev: true, mariaHost: 'localhost', mongoUri })
  }
})

test('rejects remote or malformed targets without exposing database credentials', () => {
  for (const mariaHost of [undefined, '', 'production.example.com', 'localhost.evil.example', '192.0.2.1']) {
    assert.throws(() => assertDevSeedTarget({ dev: true, mariaHost, mongoUri: 'mongodb://localhost' }), /local MariaDB/)
  }
  for (const mongoUri of [
    '',
    'https://localhost',
    'mongodb+srv://localhost',
    'mongodb://',
    'mongodb://production.example.com',
    'mongodb://localhost,production.example.com:27017/?replicaSet=cluster',
    'mongodb://production.example.com:27017,localhost',
    'mongodb://localhost.evil.example',
    'mongodb://localhost:70000',
    'mongodb://localhost,,mongo',
    'mongodb://localhost#fragment',
    'mongodb://@localhost',
    'mongodb://name:password@remote@localhost',
    'mongodb://localhost/path?invalid=%ZZ',
    'mongodb://local user:private-password@localhost',
    'mongodb://local-user:private-password@production.example.com',
  ]) {
    assert.throws(
      () => assertDevSeedTarget({ dev: true, mariaHost: 'localhost', mongoUri }),
      (error: unknown) =>
        error instanceof Error && /local mongodb/.test(error.message) && !error.message.includes('private-password'),
    )
  }
})

test('selects an explicit owner or the only signed-in account without inventing a user', () => {
  assert.equal(selectSeedOwner(ownerId, []), ownerId)
  assert.equal(selectSeedOwner(ownerId, [guildId]), ownerId)
  assert.equal(selectSeedOwner(undefined, [ownerId, ownerId]), ownerId)
  assert.throws(() => selectSeedOwner(undefined, []), /--owner-id/)
  assert.throws(() => selectSeedOwner(undefined, [ownerId, guildId]), /--owner-id/)
  assert.throws(() => selectSeedOwner('invalid', []), /--owner-id/)
  assert.throws(() => selectSeedOwner(undefined, ['invalid']), /--owner-id/)
})
