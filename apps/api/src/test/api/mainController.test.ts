import { test } from 'node:test';
import assert from 'assert';
import { testURL } from '../index.js';

// Version Info
test('GET /v3', async (t) => {
  const response = await fetch(testURL('/v3'));
  assert.strictEqual(response.status, 200);
});

// Stats
test('GET /v3/stats', async (t) => {
  const response = await fetch(testURL('/v3/stats'));
  assert.strictEqual(response.status, 200);
});
