#!/usr/bin/env bash
# gmodctl — runs the gmod-integration stack inside the Proxmox LXC created by infra/proxmox.
# Installed at /usr/local/bin/gmodctl by Terraform. Every command is idempotent.
#
#   gmodctl deploy [--auto-update true|false] [--interval 15min]
#       Install Docker if missing, pull the app images, `compose up -d`, wait for the Prisma schema push.
#   gmodctl update     Pull app images and redeploy only if one of them changed (run by gmod-update.timer).
#   gmodctl status     docker compose ps
#   gmodctl logs [svc] Follow logs (all services, or one).
#   gmodctl compose …  Any other docker compose command against the stack (exec, restart, …).
set -euo pipefail

STACK_DIR="/opt/gmod-integration"
COMPOSE=(docker compose --project-directory "$STACK_DIR" -f "$STACK_DIR/docker-stack.swarm.yml" -f "$STACK_DIR/compose.proxmox.yml")
# Only images we publish are auto-updated. Databases stay on whatever was pulled at first deploy: an
# unattended `mongo:latest` major bump can leave the data directory unreadable.
APP_SERVICES_RE='^(api|websocket|discord|prisma-migrate|cloudflared)$'

log() { printf '[gmodctl] %s\n' "$*"; }
die() { printf '[gmodctl] ERROR: %s\n' "$*" >&2; exit 1; }

apt_get() { DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 -y -q "$@"; }

wait_for_network() {
  for _ in $(seq 1 60); do
    getent hosts download.docker.com >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "no DNS resolution after 120s — check the bridge gateway / NAT on the Proxmox host"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi
  log "installing Docker Engine + Compose plugin"
  wait_for_network

  # Written before the install so the daemon starts with it:
  # - rotated logs (the app logs every request; the default json-file driver grows forever);
  # - the classic image store. Since Docker 29 images default to containerd's store in /var/lib/containerd,
  #   i.e. on the small rootfs, not on the /var/lib/docker volume sized for them.
  install -d -m 0755 /etc/docker
  if [[ ! -f /etc/docker/daemon.json ]]; then
    cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "features": { "containerd-snapshotter": false }
}
JSON
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  apt_get update
  apt_get install ca-certificates curl
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt_get update
  apt_get install docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
}

wait_for_docker() {
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "Docker daemon not ready after 60s (journalctl -u docker)"
}

app_services() {
  # Active services only: cloudflared is listed only when COMPOSE_PROFILES=tunnel is set in .env.
  # Sorted: `config --services` returns them in a different order on each call, and cmd_update compares
  # two listings.
  "${COMPOSE[@]}" config --services | grep -E "$APP_SERVICES_RE" | sort || true
}

image_ids() {
  local svc img
  for svc in $(app_services); do
    img="$("${COMPOSE[@]}" config --images "$svc" 2>/dev/null | head -n1)"
    printf '%s %s\n' "$svc" "$(docker image inspect -f '{{.Id}}' "$img" 2>/dev/null || echo none)"
  done
}

install_timer() {
  local enabled="$1" interval="$2"
  if [[ "$enabled" != "true" ]]; then
    systemctl disable --now gmod-update.timer >/dev/null 2>&1 || true
    return 0
  fi
  cat >/etc/systemd/system/gmod-update.service <<'UNIT'
[Unit]
Description=Pull new gmod-integration app images and redeploy when they changed
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/gmodctl update
UNIT
  cat >/etc/systemd/system/gmod-update.timer <<UNIT
[Unit]
Description=Check for new gmod-integration images every ${interval}

[Timer]
OnBootSec=5min
OnUnitActiveSec=${interval}
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now gmod-update.timer >/dev/null
}

wait_for_schema() {
  local cid rc
  cid="$("${COMPOSE[@]}" ps -a -q prisma-migrate)"
  [[ -n "$cid" ]] || die "prisma-migrate container not found"
  log "waiting for prisma-migrate (MariaDB first boot + prisma db push, can take a few minutes)"
  rc="$(timeout 1200 docker wait "$cid")" || die "prisma-migrate still running after 20 min: gmodctl logs prisma-migrate"
  if [[ "$rc" != "0" ]]; then
    "${COMPOSE[@]}" logs --tail 80 prisma-migrate >&2 || true
    die "prisma-migrate exited with code $rc"
  fi
  log "schema in sync"
}

cmd_deploy() {
  local auto_update="true" interval="15min"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --auto-update) auto_update="$2"; shift 2 ;;
      --interval) interval="$2"; shift 2 ;;
      *) die "deploy: unknown option $1" ;;
    esac
  done

  [[ -f "$STACK_DIR/.env" ]] || die "$STACK_DIR/.env missing (it is pushed by Terraform)"
  install_docker
  wait_for_docker
  install_timer "$auto_update" "$interval"

  log "validating compose config"
  "${COMPOSE[@]}" config --quiet

  mapfile -t services < <(app_services)
  log "pulling ${services[*]}"
  "${COMPOSE[@]}" pull --quiet "${services[@]}"

  log "starting stack"
  "${COMPOSE[@]}" up -d --remove-orphans
  wait_for_schema
  "${COMPOSE[@]}" ps
}

cmd_update() {
  wait_for_docker
  local before after
  before="$(image_ids)"
  mapfile -t services < <(app_services)
  "${COMPOSE[@]}" pull --quiet "${services[@]}"
  after="$(image_ids)"
  if [[ "$before" == "$after" ]]; then
    log "no new image"
    return 0
  fi
  log "new images:"
  diff <(echo "$before") <(echo "$after") | grep '^>' || true
  "${COMPOSE[@]}" up -d --remove-orphans
  docker image prune -f >/dev/null
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    deploy) cmd_deploy "$@" ;;
    update) cmd_update ;;
    status) "${COMPOSE[@]}" ps ;;
    logs) "${COMPOSE[@]}" logs -f --tail 100 "$@" ;;
    compose) "${COMPOSE[@]}" "$@" ;;
    *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; [[ -z "$cmd" ]] || exit 1 ;;
  esac
}

main "$@"
