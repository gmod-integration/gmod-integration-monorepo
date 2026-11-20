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
