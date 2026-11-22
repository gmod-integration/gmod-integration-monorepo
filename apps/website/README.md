# Gmod Integration - Website

The public site and administration dashboard use Solid and Vite. Run commands from the monorepo root;
dependencies are installed once using the root `bun.lock`.

```bash
bun install
bun run website:dev
bun run typecheck:website
bun run --cwd apps/website build
```

`typecheck:website` checks application source, component tests and Vite configuration. Vitest runs the
component tests in Happy DOM; native browser layout and navigation still require browser verification.

The development server uses the port in `WEBSITE_URL` (3000 by default) and fails if it is occupied.
Keep `OAUTH_REDIRECT_URL` on that same origin with the `/login` path, for example
`http://localhost:3000/login`. Run the webhook relay on a separate port by setting `APP_PORT=3002`
in `apps/webhook-relay/.env`; its standalone runtime default is also 3000.

## UI copy

English is the reference language for UI copy in `src/locales/en.json`. Keep the English fallback in
each `t()` call consistent with that dictionary, then align translations with the same meaning.
Preserve interpolation variables and console commands when translating.

Use “Discord community” or “Discord server” for the community, and “game server” for Garry's Mod.
Explain what a setting changes, its prerequisites and when it takes effect. Distinguish saving from
publishing, removing a destination from deleting a Discord channel, and a failed request from an
empty result. Features not implemented by the current addon must be identified as unavailable.
