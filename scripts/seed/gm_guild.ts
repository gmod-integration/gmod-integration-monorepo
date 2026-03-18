import prisma from '@gmod/infra-prisma'
import { devGuild } from './config.js'

export async function devSeedGuild() {
  const guild = await prisma.gm_guild.upsert({
    where: {
      guild: devGuild.id,
    },
    update: {
      name: devGuild.name,
    },
    create: {
      guild: devGuild.id,
      name: devGuild.name,
    },
  })

  console.log(guild)
}
