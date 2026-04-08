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

RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-roboto fonts-dejavu-core fonts-noto-core \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

COPY . .

CMD ["bun", "apps/discord/src/main.ts"]
