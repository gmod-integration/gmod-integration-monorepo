# Best Practices

## 1) Import/Export

- In NodeNext ESM, use local imports with the `.js` extension.
- Prefer direct package imports:
  - `@gmod/config`
  - `@gmod/infra-bullmq/discordQueueAdapters.js`
  - `@gmod/domain-server/Server.js`
- Avoid unnecessary “proxy” files that only re-export one symbol.
- If an import is type-only, use `import type`.

## 2) Logic Placement

- Controller > 10 lines: extract logic into `packages/core/src/models/*` or `packages/domain-*`.
- Middleware: keep only validation/auth/context logic.
- Domain packages: pure, domain-focused business logic.
- Infra packages: SDK clients, queues, DB adapters, cache adapters.

## 3) Contracts and Validation

- Every inter-app payload (BullMQ, critical websocket data) must have a Zod schema in `@gmod/schema`.
- Parse at entry points (producer/consumer), not “in the middle.”

## 4) Resilience

- For BullMQ calls expecting replies, handle timeouts explicitly (`BullMQReplyTimeoutError`).
- When external dependencies are unavailable (Discord), use clean fallback behavior (log + controlled skip).
- Use Redis for short/medium TTL caching on high-frequency data (for example guild locale).

## 5) TypeScript

- Avoid raw `as string` casts on HTTP params that may be `string | string[]`.
- Normalize params with a shared helper before usage.
- Avoid overusing non-null assertions (`!`) without upstream guards.

## 6) Quality

Before merge:

- `bun run lint`
- `bun run typecheck`
- `bun run format:check`

For structural migrations:

- run the affected app in dev (`turbo run dev --parallel` or targeted script),
- verify no dependency graph cycle is introduced.
