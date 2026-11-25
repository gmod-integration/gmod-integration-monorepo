# infra/proxmox

Prepare a protected, unprivileged Proxmox LXC for a **fresh** gmod-integration backend with Docker
Compose. The default `deployment_mode = "prepare"` installs and validates the bundle without starting
containers. An explicit bootstrap refuses an existing installation and runs versioned Prisma
migrations before enabling application writers.

See [the preparation and bootstrap guide](../../docs/deployment/proxmox.md) for local tests, immutable
image inputs, later server prerequisites, acceptance and failure recovery. Existing `terraform.tfvars`
and state must be preserved; the example is a reference for adding missing inputs, not an overwrite.

```bash
terraform fmt -check -recursive
python3 tests/run-isolated.py
```

These checks use mocked plans and do not authorize or perform a real server deployment. Automatic
updates are disabled. The website, documentation and webhook relay are hosted separately.
