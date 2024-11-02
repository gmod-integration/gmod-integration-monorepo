import { test } from 'node:test';
import assert from 'assert';
import testConfig, { getTestUri } from '../../config.test';

// User
test('GET /v3/users/:discordID', async (t) => {
  const response = await fetch(getTestUri('/v3/users/:discordID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testConfig.user.token,
    },
  });
  assert.strictEqual(response.status, 200);
});

// User Guilds
test('GET /v3/users/:discordID/guilds', async (t) => {
  const response = await fetch(getTestUri('/v3/users/:discordID/guilds'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testConfig.user.token,
    },
  });
  assert.strictEqual(response.status, 200);
});

// User Guilds Info
test('GET /v3/users/:discordID/guilds/:guildID', async (t) => {
  const response = await fetch(getTestUri('/v3/users/:discordID/guilds/:guildID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testConfig.user.token,
    },
  });
  assert.strictEqual(response.status, 200);
});
