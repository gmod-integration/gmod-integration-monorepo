# `apps/docs`

The [Docusaurus](https://docusaurus.io) site that publishes the **product** documentation at
[docs.gmod-integration.com](https://docs.gmod-integration.com): installation, configuration, dashboard guides,
Discord command reference, self-hosting.

Content lives in `apps/docs/docs/` and is exposed at the repo root as the `./docs`... no — **not anymore**.
Historically the repo root `./docs` symlink pointed at `apps/docs/docs`, and this folder's technical/AI content
(`docs/technical/ai/*`) was accidentally published on the public site alongside end-user guides. That has been
split:

- `apps/docs/docs/*` — public product docs only (getting-started, guides, self-hosted, others). Built and
  served by this app.
- Repo-root [`./docs`](../README.md) (this documentation) — internal engineering/AI docs. Not part of the
  Docusaurus build, not published.

## Structure

```text
docs/
  introduction.md
  getting-started/    install the addon + bot
  guides/
    dashboard/          per-page guide for every dashboard screen
    discord/             per-command guide (commands/ and right-click contexts/)
  self-hosted/          self-hosting instructions
  others/                auto-updater, disclaimer, partnership, gwsockets, ...
```

## Run it

```bash
bun run docs:dev     # docusaurus start
bun run docs:build
```

## Build dependency contract

Install dependencies from the repository root with Bun so the shared lockfile and root overrides
apply. The documentation uses Docusaurus 3.10.2 with the root-pinned tinypool 2.1.2 and
serialize-javascript 7.1.4. The latter retains the CommonJS interface used by Webpack plugins;
the worker pool is also exercised through Docusaurus SSG with two workers when changing its pin.
Use Node 22.12+ as declared by this workspace, and rerun the production build after changes to
Docusaurus, its plugins or these resolutions. No private engineering reports are part of this build.
