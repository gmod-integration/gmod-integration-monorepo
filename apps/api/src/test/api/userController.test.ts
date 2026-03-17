import { test } from 'node:test'
import assert from 'assert'
import { testURL } from '../index.js'
import { testUser } from '../config.test.js'

// User
test('GET /v3/users/:discordID', async (t) => {
  const response = await fetch(testURL('/v3/users/:discordID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testUser.token,
    },
  })
  assert.strictEqual(response.status, 200)
})

// User Guilds
test('GET /v3/users/:discordID/guilds', async (t) => {
  const response = await fetch(testURL('/v3/users/:discordID/guilds'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testUser.token,
    },
  })
  assert.strictEqual(response.status, 200)
})

// User Guilds Info
test('GET /v3/users/:discordID/guilds/:guildID', async (t) => {
  const response = await fetch(testURL('/v3/users/:discordID/guilds/:guildID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testUser.token,
    },
  })
  assert.strictEqual(response.status, 200)
})
