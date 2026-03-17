import Redis from 'ioredis'

// @ts-ignore
const redis = new Redis()

export default redis

export async function gracefulShutdownRedis() {
  await redis.quit()
}
