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
