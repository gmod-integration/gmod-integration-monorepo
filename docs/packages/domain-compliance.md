# `@gmod/domain-compliance`

Personal data exports and account erasure. HTTP contracts remain in `packages/schema`; API routes are
thin adapters. This is the first independent v6 workflow, not a migration of all v3 functionality.

## Files

- `gdrp.ts`: creates an export request, gathers SQL/Mongo records and stored screenshots, archives them,
  and uploads the archive to object storage. Collection is refused during erasure; an export that
  overlaps erasure is checked before and after upload and removed instead of announced ready.
- `accountErasure.ts`: authenticated request creation, receipt-scoped status and a durable SQL worker.
- `accountErasureStorage.ts`: idempotent cleanup of SQL, MongoDB, MinIO, temporary exports and Redis.

## Request and recovery

See the [v6 HTTP contract](../apps/api.md#account-erasure-under-v6). The browser generates a public UUID
and a separate 256-bit receipt before posting. Only the receipt hash is stored. This permits recovery
when the acknowledgement is lost after session revocation; neither the former session nor a client-
selected Discord ID authorizes status access.

`gm_user_erasure` has no cascading profile FK. Pending requests temporarily contain only the verified
Discord/Steam identifiers required for cleanup. The worker uses `pending`, `running`, `retry` and
`completed`, with an exclusive, renewable lease and bounded exponential retry delay. An API process
starts the poller after Prisma connects. Another instance can resume an expired lease after a crash.
Each destructive phase checks its lease; the SQL phase locks the lease row in its transaction.

A storage outage keeps the request in `retry`, with its identity and phase progress intact. Only a
successful second cleanup sweep permits `completed`; completion removes the temporary identity and
progress payload. Errors retain a phase code rather than database messages, object names or credentials.

## Cleanup and retained data

The worker removes profiles, account links, sessions/OAuth tokens, membership records, notifications,
votes, exports, player statistics/sessions/team time, personal captures, bug reports, local sanctions
on the subject, account-transfer records and personal filter/trigger/status references. When the subject
was an administrator in somebody else's local moderation record, only the author identifier is cleared.
It does not delete the community, its servers or configuration.

Mongo cleanup checks nested legacy fields and identity keys, including documents missing the historic
player index. Scans use bounded cursor batches. MinIO cleanup includes exported ZIPs, avatars,
referenced screenshot objects and orphan screenshot filenames containing the exact Steam identifier.
Redis session/synchronization caches and derived rule caches are invalidated, and a distributed
revocation event closes existing website WebSocket connections. Stored avatars and ingestion paths
check the erasure barrier to avoid silently collecting the profile again.

Retention is deliberately separate from the deleted profile:

- The request proof keeps its UUID, provider-scoped HMAC subjects, dates, state and recovery hash.
- `gm_user_security` contains a subject HMAC and a non-default reputation score, including an explicit
  zero. It contains no name, contact details, sessions, IP history or game activity.
- Active global `banUsers` sanctions remain enforceable with their necessary matching identifiers and
  expiry; display name and free-form reason are removed. Expired non-permanent sanctions for the subject
  are deleted. Local server bans are a different table and do not become global retention exceptions.
- An existing community GmodStore entitlement is detached from personal identifiers and secrets, with
  a stable pseudonymous purchase key so future provider revocations still address the same entitlement.

Only a deliberate OAuth sign-in can reactivate a completed request. It creates a new account without
restoring the old Steam link, privilege rank or sessions. A retained reputation remains effective.
The browser retains language/theme and the recovery receipt while clearing application account data.

## Deployment and boundaries

Apply migration `20261121110000_account_erasure` and generate Prisma before deploying the API,
WebSocket, Discord workers or website that use these models. Set a stable, strong `PRIVACY_HASH_SECRET`
before enabling erasure requests. It is distinct from the OAuth client secret. Rotate it only with an
explicit migration of subject/security/purchase keys; erasure proofs cannot be recomputed from deleted
raw identities. The compatibility fallback exists for legacy read guards, not for accepting erasures
without a configured privacy key.

This cleanup covers the application's configured live stores. It cannot discover and retract every
historic Discord message or independently downloaded copy because the old schema does not consistently
record their message IDs. Such copies require separate handling. Backups and operational logs also need
an operator retention process and replay of erasures before restored data becomes available. Do not
interpret `completed` as proof that those independent copies have been removed.

The v6 specification remains broader: transport, catalog/entitlements, remaining promised features and
migration of other routes are separate lots. The legacy impersonation model also needs server-tracked
v6 sessions and explicit reauthentication for stronger destructive-action assurance.

## Dependencies and tests

Uses `@gmod/config`, `@gmod/domain-gmod`, `@gmod/domain-user`, `@gmod/infra-minio`,
`@gmod/infra-prisma`, `@gmod/infra-mongo`, `@gmod/infra-redis` and `archiver`.

Tests cover request ownership/idempotence, explicit confirmation, lost acknowledgements, receipt-only
follow-up, reputation zero, lease exclusivity/loss, storage outages and retries, cleanup order, nested
identities, pagination, preservation of unrelated records, ingestion races and post-erasure sign-in.
They use isolated fake stores and do not erase a real account or apply production migrations.
