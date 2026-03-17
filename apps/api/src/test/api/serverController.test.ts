import { test } from 'node:test'
import assert from 'assert'
import prisma from '@gmod/infra-prisma'
import { testURL } from '../index.js'
import { testServer } from '../config.test.js'

// Server Info
test('GET /v3/servers/:serverID', async (t) => {
  const response = await fetch(testURL('/v3/servers/:serverID'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testServer.token,
    },
  })
  assert.strictEqual(response.status, 200)
})

// Server Generate Public Token
test('POST /v3/servers/:serverID/public-token', async (t) => {
  const response = await fetch(testURL('/v3/servers/:serverID/public-token'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + testServer.token,
    },
  })
  assert.strictEqual(response.status, 200)
  const prismaData = await prisma.gm_server.findFirst({
    where: {
      id: testServer.id,
    },
  })
  const responseJson = await response.json()
  assert.strictEqual(prismaData?.publicTempToken, responseJson.publicTempToken)
})
