import prisma from '@gmod/infra-prisma'
import { devGuild, devGuildVerifyAddRoles } from './config.js'

export async function devSeedVerifyRoles() {
  for (const roleID of devGuildVerifyAddRoles) {
    const verifyRole = await prisma.gm_guild_verify_role.upsert({
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

    console.log(verifyRole)
  }
}

export async function devClearVerifyRoles() {
  for (const roleID of devGuildVerifyAddRoles) {
    await prisma.gm_guild_verify_role.deleteMany({
      where: {
        guildID: devGuild.id,
        roleID,
      },
    })
  }
}
