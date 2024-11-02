import { test } from 'node:test';
import assert from 'assert';
import { getTestUri } from '../config.test';

// Version Info
test('GET /v3', async (t) => {
  const response = await fetch(getTestUri('/v3'));
  assert.strictEqual(response.status, 200);
});

// Stats
test('GET /v3/stats', async (t) => {
  const response = await fetch(getTestUri('/v3/stats'));
  assert.strictEqual(response.status, 200);
});
