import prisma from '@gmod/infra-prisma'
import { devGuild, devGuildLinks } from './config.js'

export async function devSeedGuildLinks() {
  for (const link of devGuildLinks) {
    const existingLink = await prisma.gm_server_links.findMany({
      where: {
        guild: devGuild.id,
        alias: link.name,
        url: link.url,
      },
    })
    if (existingLink.length > 0) {
      existingLink[0].url = link.url
      existingLink[0].alias = link.name
      await prisma.gm_server_links.update({
        where: {
          id: existingLink[0].id,
        },
        data: existingLink[0],
      })
      console.log(existingLink[0])
    } else {
      const dbLink = await prisma.gm_server_links.create({
        data: {
          guild: devGuild.id,
          alias: link.name,
          url: link.url,
        },
      })
      console.log(dbLink)
    }
  }
}

export async function devClearGuildLinks() {
  for (const link of devGuildLinks) {
    await prisma.gm_server_links.deleteMany({
      where: {
        guild: devGuild.id,
        alias: link.name,
      },
    })
  }
}
