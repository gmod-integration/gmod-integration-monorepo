import prisma from '@gmod/infra-prisma'
import { devGuild, devServer } from './config.js'

export async function devSeedServer() {
  const server = await prisma.gm_server.upsert({
    where: {
      id: devServer.id,
    },
    update: {
      id: devServer.id,
      token: devServer.token,
      guild: devGuild.id,
      name: 'Dev Gmod Server',
      ip: '127.0.0.1',
      port: '27015',
      verified: true,
      isPublic: true,
    },
    create: {
      id: devServer.id,
      token: devServer.token,
      guild: devGuild.id,
      name: 'dev Gmod Server',
      ip: '127.0.0.1',
      port: '27015',
      verified: true,
      isPublic: true,
    },
  })

  console.log(server)
}

export async function devClearServer() {
  await prisma.gm_server.deleteMany({
    where: {
      id: devServer.id,
    },
  })
}
