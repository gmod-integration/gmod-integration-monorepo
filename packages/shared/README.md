# Shared primitives

Small runtime primitives used by applications and domain packages without importing application logic:

- `@gmod/shared/BaseClass.js`: existing object validation base class.
- `@gmod/shared/generateToken.js`: cryptographically random alphanumeric tokens.
- `@gmod/shared/logger.js`: timestamped operational logging; debug output follows `ConfigServer.dev`.

Import the required module directly. This package must not depend on core, domain packages, database clients,
queues or applications. Keep business workflows and integrations in their owning packages. The logger's only
workspace dependency is config; object validation and token generation have no workspace dependencies.
