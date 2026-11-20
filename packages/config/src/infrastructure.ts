type Environment = Record<string, string | undefined>
type RedisConfig = { url: string } | { host: string; port: number; db: number }

function integer(value: string | undefined, fallback: number, minimum: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback
}

/** These getters read already-loaded env and never bootstrap unrelated service credentials or clients. */
export function getRedisConfig(env: Environment = process.env): RedisConfig {
  const url = env.REDIS_URL?.trim()
  if (url) return { url }

  return {
    host: env.REDIS_HOST || '127.0.0.1',
    port: integer(env.REDIS_PORT, 6379, 1),
    db: integer(env.REDIS_DB, 0, 0),
  }
}

export function getMongoConfig(env: Environment = process.env) {
  return {
    uri: env.MONGO_URI || `mongodb://${env.MONGO_HOST || '127.0.0.1'}:${env.MONGO_PORT || '27017'}`,
  }
}

export function getBullMQConnection(env: Environment = process.env) {
  return {
    host: env.BULLMQ_HOST || env.REDIS_HOST || '127.0.0.1',
    port: integer(env.BULLMQ_PORT || env.REDIS_PORT, 6379, 1),
  }
}

export function getMariaDbConfig(env: Environment = process.env) {
  const isDev = env.DEV === 'true'
  const connectionLimit = integer(env.MARIA_CONNECTION_LIMIT, isDev ? 10 : 50, 1)

  return {
    host: env.MARIA_HOST,
    port: integer(env.MARIA_PORT, 3306, 1),
    user: env.MARIA_USER,
    password: env.MARIA_PASSWORD,
    database: env.MARIA_NAME,
    connectionLimit: isDev ? Math.min(connectionLimit, 10) : connectionLimit,
  }
}
