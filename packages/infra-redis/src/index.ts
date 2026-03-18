import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL?.trim()
const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = Number.parseInt(process.env.REDIS_PORT || '6379', 10)
const redisDb = Number.parseInt(process.env.REDIS_DB || '0', 10)

const redis = redisUrl
  ? new Redis(redisUrl)
  : new Redis({
      host: redisHost,
      port: Number.isFinite(redisPort) ? redisPort : 6379,
      db: Number.isFinite(redisDb) ? redisDb : 0,
    })

export default redis

export async function gracefulShutdownRedis() {
  await redis.quit()
}
