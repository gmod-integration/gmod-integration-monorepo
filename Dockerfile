# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.3.9 AS base

WORKDIR /app

# Copy workspace manifests first for better layer cache.
COPY --parents package.json bun.lock turbo.json tsconfig.json prisma.config.ts ./
COPY --parents apps/*/package.json packages/*/package.json ./

RUN bun install --frozen-lockfile

# Copy source code.
COPY . .

ENV NODE_ENV=production

FROM base AS api
CMD ["bun", "apps/api/src/gm_integration_api.ts"]

FROM base AS websocket
CMD ["bun", "apps/websocket/src/index.ts"]

FROM base AS discord
CMD ["bun", "apps/discord/src/main.ts"]
