#!/usr/bin/env bash
# Runs on the Proxmox host. prepare stages a bundle without starting application services.
# bootstrap is only an explicit empty-installation operation.
set -euo pipefail

if [ -t 0 ] || [ -t 1 ] || [ -t 2 ]; then
  bash "$0" "$@" </dev/null 2>&1 | cat
  exit "${PIPESTATUS[0]}"
fi

[[ $# -ge 2 ]] || { echo '[push] expected VMID and staging directory' >&2; exit 1; }
VMID="$1"
STAGING="$2"
shift 2
[[ "$VMID" =~ ^[1-9][0-9]+$ && "$STAGING" == "/root/gmod-integration-deploy-$VMID" ]] || { echo '[push] invalid target or staging directory' >&2; exit 1; }
trap 'rm -rf -- "$STAGING"' EXIT
MODE=prepare
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) [[ $# -ge 2 ]] || exit 1; MODE="$2"; shift 2 ;;
    *) echo '[push] unknown option' >&2; exit 1 ;;
  esac
 done
[[ "$MODE" == prepare || "$MODE" == bootstrap ]] || { echo '[push] invalid deployment mode' >&2; exit 1; }

DEST=/opt/gmod-integration
if ! pct status "$VMID" | grep -q 'status: running'; then
  pct start "$VMID"
fi
for _ in $(seq 1 30); do
  pct exec "$VMID" -- true >/dev/null 2>&1 && break
  sleep 2
 done

# Do not overwrite credentials/configuration of an existing project, even during preparation.
pct exec "$VMID" -- sh -c '
  if command -v docker >/dev/null 2>&1; then
    containers=$(docker ps -aq --filter label=com.docker.compose.project=gmod) || exit 1
    volumes=$(docker volume ls --format "{{.Name}}") || exit 1
    if [ -n "$containers" ] || printf "%s\n" "$volumes" | grep -q "^gmod_"; then
      echo "[push] refusing to replace an existing Compose installation; review its backup and configuration first" >&2
      exit 1
    fi
  fi
'
pct exec "$VMID" -- test ! -e "$DEST/.bootstrap-complete"
pct exec "$VMID" -- install -d -m 0700 "$DEST"
pct push "$VMID" "$STAGING/gmodctl.sh" /usr/local/bin/gmodctl --perms 0755
pct exec "$VMID" -- ln -sf /usr/local/bin/gmodctl /usr/sbin/gmodctl
for file in docker-stack.swarm.yml compose.proxmox.yml proxmox-ops.py; do
  pct push "$VMID" "$STAGING/$file" "$DEST/$file" --perms 0644
 done
for file in .env cloudflared.env; do
  pct push "$VMID" "$STAGING/$file" "$DEST/$file" --perms 0600
 done
pct exec "$VMID" -- /usr/local/bin/gmodctl prepare
if [[ "$MODE" == bootstrap ]]; then
  pct exec "$VMID" -- /usr/local/bin/gmodctl bootstrap --confirm-empty gmod
fi
