import prisma from '@gmod/infra-prisma'
import { devUser } from './config.js'

export async function devSeedUser() {
  const user = await prisma.gm_user.upsert({
    where: {
      id: devUser.discordID,
    },
    update: {
      id: devUser.discordID,
      steam: devUser.steamID,
      rank: 'developer',
      email: 'admin@linv.dev',
    },
    create: {
      id: devUser.discordID,
      steam: devUser.steamID,
      rank: 'developer',
      email: 'admin@linv.dev',
    },
  })

  console.log(user)
}

export async function devClearUser() {
  await prisma.gm_user.deleteMany({
    where: {
      id: devUser.discordID,
    },
  })
}
