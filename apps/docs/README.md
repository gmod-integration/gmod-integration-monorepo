# Gmod Integration Documentation

Run commands from the monorepo root. Dependencies are installed once using the root `bun.lock`.

```bash
bun install
bun run docs:dev
bun run typecheck:docs
bun run docs:build
```

The Docusaurus product guides live in `apps/docs/docs/`. Architecture and contributor documentation
belong in the root `docs/` directory.
