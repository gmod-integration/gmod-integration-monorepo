import redis from '@gmod/infra-redis'
import { statusRoutine } from '@gmod/domain-server/Server.js'
import { givePremiumRoleOfMainGuild } from '@gmod/domain-guild/discordModels.js'
import prisma from '@gmod/infra-prisma'
import { lastGmodIntegrationTag } from '../../utils/tools.js'
import { enqueueMainClientSetPresence } from '@gmod/infra-bullmq/discordQueueAdapters.js'

export async function getStats() {
  const redisKey = 'stats'
  const redisStat = await redis.get(redisKey)
  if (redisStat !== null) {
    return JSON.parse(redisStat)
  }

  const usersCount = await prisma.users.count()
  const memberCount =
    (
      await prisma.gm_guild.aggregate({
        _sum: {
          member: true,
        },
      })
    )._sum.member || 0
  const guildCount = await prisma.gm_guild.count()
  const serverCount = await prisma.gm_server.count()
  const verifiedUserCount = await prisma.gm_user.count({
    where: {
      steam: {
        not: null,
      },
    },
  })

  const stats = {
    verifyUser: verifiedUserCount,
    user: memberCount + usersCount,
    guild: guildCount,
    server: serverCount,
  }

  await redis.set(redisKey, JSON.stringify(stats), 'EX', 120)

  return stats
}

export async function routineUpdateStatus() {
  const botStatusList = [
    async function userCount(stat: any) {
      return `${stat.user.toLocaleString()} users`
    },
    function guildCount(stat: any) {
      return `${stat.guild.toLocaleString()} guilds`
    },
    function serverCount(stat: any) {
      return `${stat.server.toLocaleString()} servers`
    },
    function version() {
      return lastGmodIntegrationTag
    },
  ]

  let lastStatusID = 0

  async function updateStatus() {
    const stats = await getStats()
    const status = botStatusList[lastStatusID]
    lastStatusID = (lastStatusID + 1) % botStatusList.length

    await enqueueMainClientSetPresence(await status(stats), 3)
  }

  // every 30s update the bot status
  setInterval(updateStatus, 30000)
  await updateStatus()
}

export async function routineServerStatusRefresh() {
  setInterval(statusRoutine, 30000)
  await statusRoutine()
}

function routPremiumRoleOfMainGuild() {
  givePremiumRoleOfMainGuild()
    .then((synced) => {
      if (!synced) {
        console.error('Error checking premium')
      } else {
        console.log('Premium checked')
      }
    })
    .catch((error) => {
      console.error('Error checking premium:', error)
    })
}

export async function routinePremiumRoleOfMainGuild() {
  setInterval(routPremiumRoleOfMainGuild, 60000)
  routPremiumRoleOfMainGuild()
}
