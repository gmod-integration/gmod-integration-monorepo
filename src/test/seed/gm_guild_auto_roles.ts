import prisma from '@gmod/infra-prisma/index.js';
import { testGuild, testGuildAutoRoles } from '../config.test.js';

export async function testSeedAutoRoles() {
  for (const roleID of testGuildAutoRoles) {
    await prisma.gm_guild_auto_roles.upsert({
      where: {
        roleID,
      },
      update: {
        guildID: testGuild.id,
      },
      create: {
        guildID: testGuild.id,
        roleID,
      },
    });
  }
}

export async function testClearAutoRoles() {
  for (const roleID of testGuildAutoRoles) {
    await prisma.gm_guild_auto_roles.deleteMany({
      where: {
        guildID: testGuild.id,
        roleID,
      },
    });
  }
}
