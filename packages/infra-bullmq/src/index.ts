const host = process.env.BULLMQ_HOST || process.env.REDIS_HOST || '127.0.0.1'
const rawPort = process.env.BULLMQ_PORT || process.env.REDIS_PORT || '6379'
const parsedPort = Number.parseInt(rawPort, 10)

export const connection = {
  host,
  port: Number.isFinite(parsedPort) ? parsedPort : 6379,
}
