import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBullMQConnection, getMariaDbConfig, getMongoConfig, getRedisConfig } from '../src/infrastructure.js'

afterEach(() => vi.unstubAllEnvs())

describe('infrastructure configuration', () => {
  it('can resolve connection defaults without credentials for Discord, Steam or other services', () => {
    expect(getRedisConfig({})).toEqual({ host: '127.0.0.1', port: 6379, db: 0 })
    expect(getMongoConfig({})).toEqual({ uri: 'mongodb://127.0.0.1:27017' })
    expect(getBullMQConnection({})).toEqual({ host: '127.0.0.1', port: 6379 })
    expect(getMariaDbConfig({})).toMatchObject({ port: 3306, connectionLimit: 50 })
  })

  it('uses an explicitly supplied environment without bootstrapping the server configuration', () => {
    vi.stubEnv('REDIS_HOST', 'host-outside-test')
    expect(getRedisConfig({ REDIS_HOST: 'test-redis', REDIS_PORT: '6380', REDIS_DB: '2' })).toEqual({
      host: 'test-redis',
      port: 6380,
      db: 2,
    })
  })

  it('reads process.env only when the caller does not supply an environment', () => {
    vi.stubEnv('REDIS_HOST', 'runtime-redis')
    vi.stubEnv('REDIS_URL', '')
    expect(getRedisConfig()).toMatchObject({ host: 'runtime-redis' })
    vi.stubEnv('MONGO_URI', 'mongodb://runtime-mongo:27018')
    expect(getMongoConfig()).toEqual({ uri: 'mongodb://runtime-mongo:27018' })
    vi.stubEnv('BULLMQ_HOST', 'runtime-queues')
    expect(getBullMQConnection().host).toBe('runtime-queues')
    vi.stubEnv('MARIA_HOST', 'runtime-db')
    expect(getMariaDbConfig().host).toBe('runtime-db')
  })

  it('gives a trimmed Redis URL precedence over host, port and database', () => {
    expect(
      getRedisConfig({
        REDIS_URL: '  rediss://user:pass@redis.example:6380/2  ',
        REDIS_HOST: 'ignored',
        REDIS_PORT: '6390',
        REDIS_DB: '8',
      }),
    ).toEqual({ url: 'rediss://user:pass@redis.example:6380/2' })
  })

  it('treats a blank Redis URL as unset', () => {
    expect(getRedisConfig({ REDIS_URL: '   ', REDIS_HOST: 'redis.example' })).toEqual({
      host: 'redis.example',
      port: 6379,
      db: 0,
    })
  })

  it.each(['invalid', '-1', '0'])('uses a valid default for invalid or nonpositive ports: %s', (port) => {
    expect(getRedisConfig({ REDIS_PORT: port })).toMatchObject({ port: 6379 })
    expect(getBullMQConnection({ BULLMQ_PORT: port })).toMatchObject({ port: 6379 })
    expect(getMariaDbConfig({ MARIA_PORT: port })).toMatchObject({ port: 3306 })
  })

  it('preserves Redis database zero and replaces invalid or negative database values', () => {
    expect(getRedisConfig({ REDIS_DB: '0' })).toMatchObject({ db: 0 })
    expect(getRedisConfig({ REDIS_DB: '-1' })).toMatchObject({ db: 0 })
    expect(getRedisConfig({ REDIS_DB: 'invalid' })).toMatchObject({ db: 0 })
  })

  it('gives BullMQ host and port precedence over Redis host and port', () => {
    expect(
      getBullMQConnection({
        BULLMQ_HOST: 'queues.example',
        BULLMQ_PORT: '6400',
        REDIS_HOST: 'redis.example',
        REDIS_PORT: '6390',
      }),
    ).toEqual({ host: 'queues.example', port: 6400 })
    expect(getBullMQConnection({ REDIS_HOST: 'redis.example', REDIS_PORT: '6390' })).toEqual({
      host: 'redis.example',
      port: 6390,
    })
  })

  it('prefers a Mongo URI and otherwise builds the configured host and port', () => {
    expect(getMongoConfig({ MONGO_URI: 'mongodb://custom.example/db', MONGO_HOST: 'ignored' })).toEqual({
      uri: 'mongodb://custom.example/db',
    })
    expect(getMongoConfig({ MONGO_HOST: 'mongo.example', MONGO_PORT: '27099' })).toEqual({
      uri: 'mongodb://mongo.example:27099',
    })
  })

  it('keeps the development connection cap and the production default', () => {
    expect(getMariaDbConfig({ DEV: 'true' }).connectionLimit).toBe(10)
    expect(getMariaDbConfig({ DEV: 'true', MARIA_CONNECTION_LIMIT: '5' }).connectionLimit).toBe(5)
    expect(getMariaDbConfig({ DEV: 'true', MARIA_CONNECTION_LIMIT: '100' }).connectionLimit).toBe(10)
    expect(getMariaDbConfig({ DEV: 'false', MARIA_CONNECTION_LIMIT: '100' }).connectionLimit).toBe(100)
    expect(getMariaDbConfig({ MARIA_CONNECTION_LIMIT: 'invalid' }).connectionLimit).toBe(50)
    expect(getMariaDbConfig({ DEV: 'true', MARIA_CONNECTION_LIMIT: '0' }).connectionLimit).toBe(10)
  })

  it('passes the configured MariaDB port and credentials to the driver config', () => {
    expect(
      getMariaDbConfig({
        MARIA_HOST: 'db.example',
        MARIA_PORT: '3307',
        MARIA_USER: 'account',
        MARIA_PASSWORD: 'password-for-test',
        MARIA_NAME: 'gmod',
      }),
    ).toMatchObject({
      host: 'db.example',
      port: 3307,
      user: 'account',
      password: 'password-for-test',
      database: 'gmod',
      timezone: '+00:00',
    })
  })
})
