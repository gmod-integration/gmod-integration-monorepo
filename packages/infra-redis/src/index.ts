import { Redis } from 'ioredis'
import { getRedisConfig } from '@gmod/config/infrastructure.js'

const config = getRedisConfig()

const redis = 'url' in config ? new Redis(config.url) : new Redis(config)

export default redis

export async function gracefulShutdownRedis() {
  await redis.quit()
}
