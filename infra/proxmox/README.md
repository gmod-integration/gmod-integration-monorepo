# infra/proxmox

Terraform that deploys the gmod-integration backend into an unprivileged LXC on Proxmox VE (Docker Compose,
Cloudflare Tunnel, no inbound port).

Full guide (prerequisites, first deploy, operations, backups): [docs/deployment/proxmox.md](../../docs/deployment/proxmox.md).

```bash
cp terraform.tfvars.example terraform.tfvars   # fill it in
terraform init && terraform apply
terraform test                                 # offline checks, Proxmox provider mocked
```

| File                        | Role                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| `host.tf`                   | pool, directory storage, bridge, ACLs, CT template (optional)            |
| `container.tf`              | the LXC and its optional vzdump job                                      |
| `env.tf`                    | generated credentials + the `.env` pushed into the container, validation |
| `deploy.tf`                 | pushes the bundle over SSH (`pct push`) and runs `gmodctl deploy`        |
| `files/compose.proxmox.yml` | Compose override that runs `docker-stack.swarm.yml` without Swarm        |
| `files/gmodctl.sh`          | in-container helper: install Docker, deploy, update, status, logs        |
| `files/push.sh`             | host-side script run by `deploy.tf`                                      |
| `imports.tf.example`        | adopt resources created by an earlier Terraform config                   |
