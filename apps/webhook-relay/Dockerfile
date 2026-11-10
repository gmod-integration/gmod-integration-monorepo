# syntax=docker/dockerfile:1.7-labs

# Standalone image: the relay is bundled into one file, so the runtime stage carries neither the
# monorepo nor its node_modules. Build from the repo root:
#   docker build -f apps/webhook-relay/Dockerfile -t webhook-relay .
FROM oven/bun:1.3.9 AS build
WORKDIR /app

# The workspace manifests are needed for bun to read the lockfile; --filter then installs only
# this app's dependencies.
COPY --parents package.json bun.lock apps/*/package.json packages/*/package.json ./
RUN bun install --frozen-lockfile --filter @gmod/app-webhook-relay

# src only: never a developer's local apps/webhook-relay/.env.
COPY apps/webhook-relay/src ./apps/webhook-relay/src
RUN bun build apps/webhook-relay/src/index.ts --target=bun --outfile=/out/relay.js

FROM oven/bun:1.3.9-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/relay.js ./relay.js
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.APP_PORT || 3000)).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "relay.js"]
