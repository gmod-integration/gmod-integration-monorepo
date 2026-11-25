import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertDiscordSeedGuild, integrationNeedsCreation } from './discord.js'

test('Discord setup only targets the configured bot development guild', () => {
  assertDiscordSeedGuild('1051881514020917408', '1051881514020917408')
  assert.throws(() => assertDiscordSeedGuild('915311346103386142', '1051881514020917408'), /DISCORD_GUILD_ID/)
})

test('reuses live Discord integrations and repairs deleted messages or webhooks', () => {
  assert.equal(integrationNeedsCreation(null, 'channel', []), true)
  const existing = { channel: 'channel', externalId: 'message-or-webhook' }
  assert.equal(integrationNeedsCreation(existing, 'channel', ['message-or-webhook']), false)
  assert.equal(integrationNeedsCreation(existing, 'channel', ['another-object']), true)
  assert.equal(integrationNeedsCreation(existing, 'channel', []), true)
})

test('does not replace an integration configured in a different Discord channel', () => {
  assert.throws(
    () =>
      integrationNeedsCreation({ channel: 'developer-channel', externalId: 'existing' }, 'demo-channel', ['existing']),
    /preserved/,
  )
})
