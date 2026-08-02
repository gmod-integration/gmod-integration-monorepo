# Reports

Where AI-generated (or human-written) audits, investigations, and one-off analyses get saved, so they survive
past the chat session that produced them.

## When to create one

Whenever someone asks an AI agent to investigate, audit, or write up a finding on a topic — "audit the auth
flow", "why is the websocket app leaking memory", "report on X" — and the answer is more than a quick chat
reply: save it as a file here instead of leaving it only in the conversation. Same for a human writing up an
incident postmortem or a one-off design investigation by hand.

Don't create one for routine work (a normal bug fix, a normal feature PR) — that's what commit messages and
PR descriptions are for. This folder is for standalone investigations: something someone would plausibly want
to find again in three months by browsing this directory.

## Where and how

- One file per report, flat in this folder (no subfolders — keep it a simple, greppable list).
- Filename: `YYYY-MM-DD-kebab-case-topic.md` (date = when the report was produced, not when the underlying
  event happened).
- Start from [`TEMPLATE.md`](./TEMPLATE.md).
- Add a row to the [index](#index) below when you add a report.

## Reports are frozen in time — don't edit them later

A report reflects what was true and what was found on the date it was written. If reality changes (the issue
gets fixed, the recommendation gets rejected, the architecture moves on):

- **Do** update the report's own `Status` line (see template) to `Resolved`, `Superseded`, `Rejected`, etc.,
  with one line saying what happened and, if relevant, a link to the follow-up report or the commit/PR that
  acted on it.
- **Don't** rewrite the findings/body to match the new reality — that destroys the historical record of what
  was actually observed at the time.
- If a finding turns into a permanent rule or a structural change, that belongs in the living docs
  ([architecture.md](../architecture.md), the relevant [apps/](../apps) or [packages/](../packages) page,
  ...) — the report stays as the *why*/investigation trail, the living doc becomes the *current state*.

## Index

| Date | Topic | Report |
| --- | --- | --- |
| 2026-08-02 | Technical documentation was scattered, partly wrong, and mixed with the public product docs | [2026-08-02-documentation-audit.md](./2026-08-02-documentation-audit.md) |
| 2026-08-02 | Real test coverage is ~0%; the only existing test suite is broken and untested in CI | [2026-08-02-test-coverage-audit.md](./2026-08-02-test-coverage-audit.md) |
