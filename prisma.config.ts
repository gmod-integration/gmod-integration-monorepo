import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'packages/infra-prisma/schema.prisma',
  migrations: {
    path: 'packages/infra-prisma/migrations',
    seed: 'tsx src/test/seed/index.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
