# Contributing

This repo used to take changes straight on `main`. Going forward, changes go through a branch and
a pull request instead, so CI (tests + coverage) gates what lands on `main` and history stays
reviewable.

## Branching

- `main` is the protected, always-deployable branch. Don't commit to it directly.
- Create a branch per logical change, off an up-to-date `main`:

  ```bash
  git checkout main
  git pull
  git checkout -b <type>/<short-description>
  ```

- Branch name prefixes (match the commit type you'll use, see below):

  | Prefix      | Use for                               |
  | ----------- | ------------------------------------- |
  | `feat/`     | New functionality                     |
  | `fix/`      | Bug fixes                             |
  | `test/`     | Test-only changes                     |
  | `docs/`     | Documentation only                    |
  | `chore/`    | Tooling, CI, dependency bumps, config |
  | `refactor/` | Code change with no behavior change   |

  Example: `feat/websocket-reconnect-backoff`, `fix/discord-role-sync-race`.

- Keep branches scoped to one change. Don't bundle an unrelated fix into a feature branch.

## Commits

This repo already follows [Conventional Commits](https://www.conventionalcommits.org/) informally
(see `git log`) — keep doing that:

```
<type>: <short, present-tense summary>

[optional body: the "why", not a restatement of the diff]
```

Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`. Scope prefixes (`feat(discord): ...`)
are fine when a commit is clearly scoped to one app/package.

## Pull requests

1. Push your branch and open a PR against `main`.
2. **CI must be green** — the `Test` workflow runs the full workspace suite
   (`bun run test:coverage`) against real MariaDB/Redis/Mongo/MinIO service containers, and
   `publish_images` in `build.yml` can't run until it passes. There's no separate review
   requirement right now (solo/small-team project) — a green PR can be merged by its author.
3. New or changed logic ships with tests in the same PR. Every `apps/*` and `packages/*` package
   has a coverage threshold enforced in the root `vitest.config.ts` — a PR that drops a package's
   coverage below its gate fails CI.
4. Squash or keep commits as-is when merging, whichever keeps `main`'s history readable — no hard
   rule either way for a small team.

## Before opening a PR

```bash
bun run lint
bun run typecheck
bun run test:coverage
```

(`bun run format:check` too, if you touched formatting-sensitive files.)

## Where the deeper rules live

- [`docs/best-practices.md`](./docs/best-practices.md) — import conventions, where logic belongs
  (`apps/*` vs `packages/*`), TypeScript rules, pre-merge checklist.
- [`docs/architecture.md`](./docs/architecture.md) — why the repo is shaped the way it is.
- [`docs/migration-playbook.md`](./docs/migration-playbook.md) — moving code between `apps/*` and
  `packages/*`.
- [`AGENT.md`](./AGENT.md) — operational rules for AI agents working in this repo (also applies to
  the branch/PR workflow above: no direct commits to `main`).
