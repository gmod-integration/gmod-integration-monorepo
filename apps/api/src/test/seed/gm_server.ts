import prisma from '@gmod/infra-prisma';
import { testGuild, testServer } from "../config.test.js";

export async function testSeedServer() {
  await prisma.gm_server.create({
    data: {
      id: testServer.id,
      token: testServer.token,
      guild: testGuild.id,
      name: 'Test Gmod Server',
      ip: '127.0.0.1',
      port: '27015',
      verified: true,
      isPublic: true,
    },
  });
}

export async function testClearServer() {
  await prisma.gm_server.deleteMany({
    where: {
      id: testServer.id,
    },
  });
}