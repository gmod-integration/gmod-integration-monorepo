# syntax=docker/dockerfile:1.7-labs

FROM oven/bun:1.3.9 AS deps
WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY --parents package.json bun.lock turbo.json tsconfig.json prisma.config.ts ./
COPY --parents apps/*/package.json packages/*/package.json ./

RUN bun install --frozen-lockfile

FROM deps AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY . .

EXPOSE 53139
CMD ["bun", "apps/websocket/src/index.ts"]
