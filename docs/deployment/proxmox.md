# Proxmox Deployment (Terraform)

`infra/proxmox/` deploys the whole backend — the same services as [swarm.md](./swarm.md) — into one
unprivileged LXC container on a Proxmox VE node, from a single `terraform apply`.

## What gets created

```text
Proxmox node
├── pool gmod-integration, storage dir-gmi, bridge vmbr1 (10.10.10.1/24)   ← optional, manage_host_resources
└── CT 110  gmod-integration  10.10.10.20  (unprivileged, nesting + keyctl)
    ├── /var/lib/docker on its own volume (images + every database volume)
    ├── /opt/gmod-integration/{docker-stack.swarm.yml, compose.proxmox.yml, .env, cloudflared.env}
    ├── /usr/local/bin/gmodctl  + gmod-update.timer (pulls new app images every 15 min)
    └── docker compose project "gmod":
        traefik (127.0.0.1:80) ← cloudflared (outbound tunnel, host network)
        api ×2, websocket ×2, discord ×1, prisma-migrate (one-shot)
        mariadb, redis, mongo, minio (no published port)
```

Nothing listens on the bridge: public traffic only arrives through the Cloudflare Tunnel, which connects out
from the container and hands requests to Traefik on `localhost:80`.

### Why Compose and not Swarm

Swarm's routing mesh and service VIPs are implemented with IPVS, which an unprivileged container cannot
program, so a Swarm stack does not work reliably inside a Proxmox LXC. Rather than maintaining a second
production definition, `infra/proxmox/files/compose.proxmox.yml` is an **override** applied on top of
`docker-stack.swarm.yml`:

- images, startup wait loops, healthchecks and volumes come from the Swarm file unchanged;
- every published port is removed (MariaDB/Redis/Mongo/MinIO were reachable in Swarm, see
  the 2026-09-18 audit, branch `docs/audit-complet-2026-09-18`); Traefik is published on `127.0.0.1` only;
- Traefik uses the plain Docker provider (labels on containers instead of `deploy.labels`);
- `deploy:` blocks are replaced by `restart: unless-stopped` — Compose would turn
  `restart_policy: {condition: any, max_attempts: 3}` into a policy the engine rejects;
- `discord` runs 1 replica by default (the audit found that 2 replicas process gateway events twice).

What you lose compared to Swarm: rolling `start-first` updates. `docker compose up -d` recreates a service's
containers in place, so an image update means a few seconds of downtime for that service.

If you need exact Swarm parity, run the Swarm stack in a QEMU VM instead; this module does not cover that.

## Prerequisites

1. **API token** with enough rights; `root@pam!terraform` works. The provider also needs **SSH as root to the
   node through your ssh-agent**: it uploads files over SSH and mints a root ticket for `keyctl`, which an API
   token cannot set by itself. The deployment step also goes through that SSH connection (`pct push` /
   `pct exec`).
2. **Outbound NAT for the bridge.** `vmbr1` has no physical port; the host must masquerade `10.10.10.0/24`.
   The Proxmox API cannot express this. Check whether it is already there:

   ```bash
   iptables -t nat -S POSTROUTING | grep 10.10.10.0/24
   ```

   If not, add it independently of `/etc/network/interfaces` (which Terraform rewrites through the API):

   ```bash
   echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/99-ip-forward.conf && sysctl --system
   cat > /etc/systemd/system/nat-vmbr1.service <<'EOF'
   [Unit]
   Description=Masquerade 10.10.10.0/24 (vmbr1) behind vmbr0
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=oneshot
   RemainAfterExit=yes
   ExecStart=/usr/sbin/iptables -t nat -A POSTROUTING -s 10.10.10.0/24 -o vmbr0 -j MASQUERADE
   ExecStop=/usr/sbin/iptables -t nat -D POSTROUTING -s 10.10.10.0/24 -o vmbr0 -j MASQUERADE

   [Install]
   WantedBy=multi-user.target
   EOF
   systemctl enable --now nat-vmbr1
   ```

3. **A Cloudflare Tunnel** (remotely managed, token-based) with two public hostnames, both pointing at
   `http://localhost:80`:

   | Public hostname       | Service               |
   | --------------------- | --------------------- |
   | `api.your-domain.com` | `http://localhost:80` |
   | `ws.your-domain.com`  | `http://localhost:80` |

   Do not route the Traefik dashboard through the tunnel: it has no authentication.

   If you reuse a tunnel that another connector is still running (e.g. a test container), Cloudflare spreads
   requests across all of them. Stop the other connector first.

4. **The application variables** listed in `.env.example` (Discord, GModStore, Steam, URLs…). MariaDB and
   MinIO credentials are generated if you do not provide them.

## First deployment

```bash
cd infra/proxmox
cp terraform.tfvars.example terraform.tfvars    # gitignored; fill it in
export TF_VAR_proxmox_api_token=…               # or put it in terraform.tfvars
export TF_VAR_cloudflare_tunnel_token=…
terraform init
terraform plan
terraform apply
```

`terraform plan` fails early, with the list of keys, if a variable required by `@gmod/config` is missing,
is still `SECRET`, or if a password is shorter than 17 characters.

The apply creates the container, installs Docker in it, pulls the images, starts the stack and waits for
`prisma db push` to finish. On a first run that takes a few minutes (MariaDB initialises its data
directory first). The `ops` output prints the commands to check on it.

### Coming from `~/terraform-test`

The pool, storage, bridge and ACLs already exist in the test state. Two options:

- leave them there: `manage_host_resources = false`, and this module only references them by name;
- adopt them: follow `infra/proxmox/imports.tf.example`, which removes the nginx test container and moves
  the resources over with import blocks. The plan must show only imports and in-place updates for them,
  never a destroy.

Either way, stop the test container's `cloudflared` before enabling the tunnel here if both use the same
token (see prerequisite 3).

## Variables: where each value comes from

The `.env` pushed to the container is built in `env.tf`, lowest to highest precedence:

1. generated: `MARIA_*` credentials, `MINIO_*` keys, `DOMAIN_URL=https://<api_host>`, `DEV=false`;
2. `env_file`: an existing `.env`, e.g. a copy of production's. Values are copied raw (quotes included).
   Host/port keys such as `MARIA_HOST`, `MARIA_URL` or `MINIO_ENDPOINT` are harmless there:
   `docker-stack.swarm.yml` forces or rebuilds them. A local dev `.env` needs two overrides in `app_env`:
   `MARIA_USER` (the plan refuses `root`, which the MariaDB image rejects) and `DOMAIN_URL` (it wins over
   the generated `https://<api_host>`);
3. `app_env`: a map in `terraform.tfvars`;
4. keys set from Terraform variables: `API_HOST`, `WS_HOST`, `*_IMAGE` (from `image_tag`),
   `*_REPLICAS` (from `replicas`), `COMPOSE_PROFILES`.

The tunnel token goes to a separate `cloudflared.env`, so it never reaches the app containers.

**The Terraform state contains all of these secrets in clear.** It is local and gitignored by default. If you
move it to a remote backend, pick one that encrypts at rest and restricts access.

## Day-to-day operations

All commands go through the Proxmox host (`terraform output ops` prints them with your values):

```bash
ssh root@pve pct exec 110 -- gmodctl status          # docker compose ps
ssh -t root@pve pct exec 110 -- gmodctl logs api     # follow one service (or all, without argument)
ssh root@pve pct exec 110 -- gmodctl update          # pull app images now, redeploy if they changed
ssh -t root@pve pct exec 110 -- gmodctl compose exec mariadb mariadb -u root -p
ssh -t root@pve pct enter 110                        # shell in the container
```

| I want to…                 | Do                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| change a variable          | edit `terraform.tfvars`, `terraform apply`: only the services whose config changed are recreated      |
| deploy a new image         | nothing: `gmod-update.timer` picks up a new `latest` within 15 min (`auto_update = false` to opt out) |
| pin / roll back to a build | `image_tag = "sha-<commit>"`, `terraform apply`                                                       |
| change the stack itself    | edit `docker-stack.swarm.yml` or `compose.proxmox.yml`, `terraform apply`                             |
| force a full redeploy      | `terraform apply -replace=terraform_data.deploy`                                                      |
| look at the Traefik routes | `pct exec 110 -- curl -s localhost:8080/api/http/routers`                                             |

The timer only updates the images built from this repo (`api`, `websocket`, `discord`) and `cloudflared`.
MariaDB, Mongo, Redis and MinIO stay on the version pulled at first deploy: the stack uses `:latest` tags, and
an unattended Mongo major upgrade can leave the data directory unreadable. Upgrade them deliberately:
`gmodctl compose pull mongo && gmodctl compose up -d mongo`, after a backup.

Container logs use Docker's `local` driver, rotated at 5 × 20 MB per container. Docker runs with its classic
image store (`"containerd-snapshotter": false` in `/etc/docker/daemon.json`): since Docker 29 the default
puts images in `/var/lib/containerd`, on the rootfs, instead of the `/var/lib/docker` volume.

## Backups

Set `backup_storage` to a storage with the `backup` content type to get a nightly vzdump job of the container
(`backup_schedule`, `backup_retention`). It includes the `/var/lib/docker` volume, so all database data. The
dump is crash-consistent (MariaDB, Mongo and Redis recover from it), but it lives on the same Proxmox node
unless the storage is remote. Production's offsite Plakar backups (`scripts/crontab.example`) are not part
of this module.

## Destroying or replacing the container

`protection = true` (the default) makes Proxmox refuse to delete the container or its disks. That is what
keeps a `terraform apply` that would replace the container (e.g. a changed template) from wiping the data.
To really destroy it, set `protection = false`, apply, then destroy.

## Tests

```bash
cd infra/proxmox && terraform test
```

Plan-only, with the Proxmox provider mocked: it checks the `.env` rendering and precedence, the `env_file`
parser and the plan-time validations, without contacting any node.

## Troubleshooting

- **`gmodctl: no DNS resolution after 120s`**: the container has no outbound access, so check the NAT rule
  (prerequisite 2) and `var.dns_servers`.
- **`prisma-migrate exited with code …`**: `gmodctl logs prisma-migrate`. A first `P1001` while MariaDB boots
  is normal; the script retries.
- **The API answers 404 through the tunnel**: the hostname does not match `api_host`/`ws_host`, so Traefik
  has no route for it (`gmodctl compose logs traefik`).
- **`pct push`/`pct exec` fails right after creation**: `push.sh` waits up to 60 s for the container's init;
  re-run `terraform apply`. The deploy step is tainted on failure and runs again.
