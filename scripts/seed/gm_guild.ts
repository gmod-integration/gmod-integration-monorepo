import prisma from '@gmod/infra-prisma'
import { testGuild } from './config.js'

export async function testSeedGuild() {
  await prisma.gm_guild.upsert({
    where: {
      guild: testGuild.id,
    },
    update: {
      name: testGuild.name,
    },
    create: {
      guild: testGuild.id,
      name: testGuild.name,
    },
  })
}
