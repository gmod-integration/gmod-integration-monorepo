import prisma from '@gmod/infra-prisma'
import { devGuild, devGuildAutoRoles } from './config.js'

export async function devSeedAutoRoles() {
  for (const roleID of devGuildAutoRoles) {
    const autoRole = await prisma.gm_guild_auto_roles.upsert({
      where: {
        roleID,
      },
      update: {
        guildID: devGuild.id,
      },
      create: {
        guildID: devGuild.id,
        roleID,
      },
    })

    console.log(autoRole)
  }
}

export async function devClearAutoRoles() {
  for (const roleID of devGuildAutoRoles) {
    await prisma.gm_guild_auto_roles.deleteMany({
      where: {
        guildID: devGuild.id,
        roleID,
      },
    })
  }
}
