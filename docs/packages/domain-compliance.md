# `@gmod/domain-compliance`

GDPR data requests: export ("give me my data") and erasure.

## Files

- `gdrp.ts` — `getUserDataGRPD(user)`: creates a `gm_users_data_request` record, pulls the user's server logs
  (`@gmod/core/database/gm_server_logs.js`) and in-game error reports
  (`@gmod/domain-gmod/GmodErrors.js`), packages them with `archiver`, and stores the resulting archive in
  object storage via `@gmod/infra-minio` (upload/download through the S3 client).

## Depends on

`@gmod/config`, `@gmod/domain-gmod`, `@gmod/domain-user`, `@gmod/infra-minio`, `@gmod/infra-prisma`,
`archiver`.

## Used by

`apps/api` (dashboard "download my data" / account deletion endpoints).
