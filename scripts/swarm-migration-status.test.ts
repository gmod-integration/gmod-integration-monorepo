import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrationsAreCurrent } from './swarm-migration-status.js'

test('startup requires every checked-in migration with its exact checksum', () => {
  const expected = new Map([
    ['init', 'abc'],
    ['auth', 'def'],
  ])
  const applied = (name: string, checksum: string) => ({
    migration_name: name,
    checksum,
    finished_at: new Date(),
    rolled_back_at: null,
  })
  assert.equal(migrationsAreCurrent(expected, [applied('init', 'abc')]), false)
  assert.equal(migrationsAreCurrent(expected, [applied('init', 'abc'), applied('auth', 'wrong')]), false)
  assert.equal(migrationsAreCurrent(expected, [applied('init', 'abc'), applied('auth', 'def')]), true)
  assert.equal(
    migrationsAreCurrent(expected, [applied('init', 'abc'), applied('auth', 'def'), applied('future', 'ghi')]),
    false,
  )
  assert.equal(migrationsAreCurrent(new Map(), []), false)
})

test('failed or rolled-back migrations cannot authorize a writer', () => {
  const expected = new Map([['auth', 'def']])
  const incomplete = { migration_name: 'auth', checksum: 'def', finished_at: null, rolled_back_at: null }
  assert.equal(migrationsAreCurrent(expected, [incomplete]), false)
  assert.equal(migrationsAreCurrent(expected, [{ ...incomplete, rolled_back_at: new Date() }]), false)
  assert.equal(migrationsAreCurrent(expected, [incomplete, { ...incomplete, finished_at: new Date() }]), false)
})
