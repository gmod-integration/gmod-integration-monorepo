#!/usr/bin/env bash
# Runs on the Proxmox host, over SSH, from terraform_data.deploy (infra/proxmox/deploy.tf).
# Copies the bundle staged by Terraform into the container, then runs `gmodctl deploy` inside it.
#
#   push.sh <vmid> <staging-dir> [gmodctl deploy options…]
#
# The staging dir holds the rendered .env, so it is removed whatever happens.
set -euo pipefail

# Terraform's remote-exec runs this under a PTY. pct exec (lxc-attach) then gives the command a pty of its
# own, and the command ends with SIGHUP (exit 129) even when it succeeded. Run detached from any terminal.
if [ -t 0 ] || [ -t 1 ] || [ -t 2 ]; then
  bash "$0" "$@" </dev/null 2>&1 | cat
  exit "${PIPESTATUS[0]}"
fi

VMID="$1"
STAGING="$2"
shift 2
trap 'rm -rf "$STAGING"' EXIT

DEST="/opt/gmod-integration"

if ! pct status "$VMID" | grep -q 'status: running'; then
  echo "[push] starting CT $VMID"
  pct start "$VMID"
fi
# pct exec fails while the container's init is still coming up right after creation/start.
for _ in $(seq 1 30); do
  pct exec "$VMID" -- true >/dev/null 2>&1 && break
  sleep 2
done

echo "[push] copying bundle into CT $VMID:$DEST"
pct exec "$VMID" -- install -d -m 0700 "$DEST"
pct push "$VMID" "$STAGING/gmodctl.sh" /usr/local/bin/gmodctl --perms 0755
# pct exec runs with PATH=/sbin:/bin:/usr/sbin:/usr/bin: make `pct exec <vmid> -- gmodctl …` work.
pct exec "$VMID" -- ln -sf /usr/local/bin/gmodctl /usr/sbin/gmodctl
pct push "$VMID" "$STAGING/docker-stack.swarm.yml" "$DEST/docker-stack.swarm.yml" --perms 0644
pct push "$VMID" "$STAGING/compose.proxmox.yml" "$DEST/compose.proxmox.yml" --perms 0644
pct push "$VMID" "$STAGING/.env" "$DEST/.env" --perms 0600
pct push "$VMID" "$STAGING/cloudflared.env" "$DEST/cloudflared.env" --perms 0600

echo "[push] gmodctl deploy $*"
pct exec "$VMID" -- /usr/local/bin/gmodctl deploy "$@"
