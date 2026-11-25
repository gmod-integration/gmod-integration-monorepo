# `@gmod/infra-minio`

Personal avatar writes check the erasure registry before and after upload. If erasure starts while a
remote avatar is downloading, the new object is deleted instead of exposing its URL. Privacy lookup or
cleanup failures do not fall back to a remote personal avatar URL. The technical registry adapter is
`@gmod/infra-prisma/privacy.js`; guild icons remain independent of account erasure.

S3-compatible object storage client (MinIO), via `@aws-sdk/client-s3`. Used for anything that shouldn't live
in the relational/document databases: avatars, screenshots, GDPR export archives.

## Exports (`src/index.ts`)

- `s3` — the configured `S3Client` (`ConfigMinIO` from `@gmod/config`, `forcePathStyle: true`).
- `createBucketIfNotExists(bucketName)` — validates the bucket name format and creates it if missing.
- Avatar/object helpers used elsewhere in the codebase (e.g. `ensureAvatarStored`, referenced from
  `@gmod/infra-steam` and `@gmod/domain-guild`).

## Used by

`@gmod/infra-steam` (avatar storage), `@gmod/domain-guild` (Discord avatar caching), `@gmod/domain-compliance`
(GDPR export archive upload/download).
