import { test } from 'node:test';
import assert from 'assert';
import testConfig, { getTestUri } from '../config.test.js';
import prisma from '../../prisma.js';

// Server Info
test('GET /v3/servers/:serverID', async (t) => {
  const response = await fetch(getTestUri('/v3/servers/:serverID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testConfig.server.token,
    },
  });
  assert.strictEqual(response.status, 200);
});

// Server Generate Public Token
test('POST /v3/servers/:serverID/public-token', async (t) => {
  const response = await fetch(getTestUri('/v3/servers/:serverID/public-token'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testConfig.server.token,
    },
  });
  assert.strictEqual(response.status, 200);
  const prismaData = await prisma.gm_server.findFirst({
    where: {
      id: testConfig.server.id,
    },
  });
  const responseJson = await response.json();
  assert.strictEqual(prismaData?.publicTempToken, responseJson.publicTempToken);
});
