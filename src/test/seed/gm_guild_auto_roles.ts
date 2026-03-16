import prisma from 'src/services/prisma/index.js';
import { testGuild, testGuildAutoRoles } from '../config.test.js';


export async function testSeedAutoRoles() {
  for (const roleID of testGuildAutoRoles) {
    await prisma.gm_guild_auto_roles.create({
      data: {
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