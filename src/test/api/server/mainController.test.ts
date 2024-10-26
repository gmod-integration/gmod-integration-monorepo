import { test } from 'node:test';
import { serverConfig } from '../../../config';
import assert from 'assert';
import testConfig from '../../config.test';

const port = serverConfig.ports.api;

function getUri(path: string): string {
  // remplace :discordID par le discordID du testConfig
  path = path.replace(/:discordID/g, testConfig.user.discordID);
  // remplace :steamID par le steamID64 du testConfig
  path = path.replace(/:steamID64/g, testConfig.user.steamID);
  // remplace :serverID par le serverID du testConfig
  path = path.replace(/:serverID/g, testConfig.server.id);

  return `http://localhost:${port}${path}`;
}

// Test pour GET /ping
test('GET /v3', async (t) => {
  const response = await fetch(getUri('/v3'));
  const data = await response.json();
  console.log(data);
  assert.strictEqual(response.status, 200);
});

// Test User
test('GET /v3/users/:discordID', async (t) => {
  const response = await fetch(getUri('/v3/users/:discordID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testConfig.user.token,
    },
  });
  const data = await response.json();
  console.log(data);
  assert.strictEqual(response.status, 200);
});

// // Create new Server
// test('POST /v3/server', async (t) => {
//   const response = await fetch(getUri('/v3/server'), {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': 'Bearer ' + testConfig.user.token
//     },
//     body: JSON.stringify({})
//   });
//   const data = await response.json();
//   console.log(data);
//   assert.strictEqual(response.status, 200);
// };
