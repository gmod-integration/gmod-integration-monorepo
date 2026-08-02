# Documentation audit

- **Date:** 2026-08-02
- **Requested by / context:** the user noticed Claude Code needed an unusually large amount of file
  exploration ("beaucoup de fetch") to work in this repo, and suspected the docs — especially `./docs` and the
  architecture docs — were wrong or incomplete. Asked for an audit report and for the project to be documented.
- **Status:** Resolved — acted on directly in the same session (see Outcome).

## Context

Audited `./docs` (at the time: a symlink to `apps/docs/docs`, the public Docusaurus product-doc site) and
`docs/technical/ai/*` (the architecture/AI docs living inside that public site) against the actual repository
structure and source code.

## Findings

1. **Technical/AI docs were published on the public product site.** `docs/technical/ai/{agent,architecture,
   best-practices,migration-playbook,readme}.md` and `docs/technical/swarm_start.md` were served at
   docs.gmod-integration.com alongside end-user guides (Discord command reference, dashboard screenshots). A
   doc meant for engineers/AI agents editing the monorepo has no reason to be on the product's public site.

2. **Broken cross-references between the docs themselves.** `AGENT.md` (a symlink to
   `docs/technical/ai/agent.md`) and `docs/technical/ai/readme.md` linked to `docs/ai/README.md`,
   `docs/ai/ARCHITECTURE.md`, etc. — paths that didn't exist. The real files were at
   `docs/technical/ai/readme.md`, `docs/technical/ai/architecture.md` (different casing, different folder).
   An agent following those links found nothing.

3. **The architecture map was incomplete.** `docs/technical/ai/architecture.md` described `apps/{api,discord,
   websocket,website}` and `packages/{config,schema,infra-*,domain-*,core}`, but omitted `apps/docs` (the
   Docusaurus site itself), `packages/locales`, and — most significantly —
   `submodules/gmod-integration`: the actual Garry's Mod Lua addon, i.e. the client of everything else in the
   repo. It has its own well-written `AGENTS.md`, but nothing in the main monorepo referenced it, so an agent
   reading `AGENT.md` at the repo root would never discover the submodule exists.

4. **No package had a description or a README.** All 17 packages under `packages/*` had `"description": ""`
   in `package.json` and no `README.md`. There was no way to know what `domain-server` vs. `domain-guild` vs.
   `infra-mongo` did without reading their source each time — the most likely direct cause of the "beaucoup de
   fetch" the user observed.

5. **No "why" documentation anywhere.** The existing docs covered the "what" (folder structure) and the "how"
   (import rules), never the "why" (why 3 separate apps, why BullMQ as the Discord bridge instead of a direct
   call, why both MariaDB and MongoDB, why the GMod addon is a separate submodule).

What was already good, for the record: `docs/technical/swarm_start.md` (Docker Swarm deployment) was accurate
against the real scripts/stack file, and the end-user product guides (`getting-started/`,
`guides/dashboard/`, `guides/discord/commands/`) were complete with screenshots.

## Recommendation

- Stop publishing internal/AI docs on the public site; give them their own home in the repo.
- Fix the cross-references.
- Document the "why", not just the "what"/"how".
- Add the missing pieces to the architecture map: `apps/docs`, `packages/locales`,
  `submodules/gmod-integration`.
- Give every package and app a short, real doc (structure, key files, dependencies) instead of nothing.

## Outcome

All of the above was implemented directly in this session (2026-08-02):

- Removed the `./docs` symlink and `AGENT.md` symlink; deleted `apps/docs/docs/technical/*` from the public
  site.
- Created a real `./docs/` folder: [docs/README.md](../README.md) (docmap), [docs/architecture.md](../architecture.md)
  (rewritten with a "Why this shape" section and an end-to-end data-flow diagram),
  [docs/best-practices.md](../best-practices.md), [docs/migration-playbook.md](../migration-playbook.md),
  [docs/deployment/swarm.md](../deployment/swarm.md), one file per app under [docs/apps/](../apps) and per
  package under [docs/packages/](../packages), and [docs/submodules/gmod-integration.md](../submodules/gmod-integration.md).
- Rewrote root `AGENT.md` as a real file (no longer a symlink) pointing to `docs/README.md`.
- Added [docs/architectures/](../architectures/README.md) (Mermaid diagrams: system overview, BullMQ
  request/reply bridge, WebSocket cross-replica delivery, package dependency layers, deployment topology) and
  this `docs/reports/` convention, in a follow-up request the same day.
