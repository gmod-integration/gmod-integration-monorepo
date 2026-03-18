import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'packages/infra-prisma/schema.prisma',
  migrations: {
    path: 'packages/infra-prisma/migrations',
    seed: 'tsx apps/api/src/test/seed/index.ts',
  },
  datasource: {
    url: env('MARIA_URL'),
  },
})
