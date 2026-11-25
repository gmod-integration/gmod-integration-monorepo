#!/usr/bin/env bash
# gmodctl prepare                  Install Docker, disable automatic updates and validate the bundle.
# gmodctl preflight [--pull]       Check the empty target and immutable images; no containers are started.
# gmodctl bootstrap --confirm-empty gmod
#                                 Start a new installation only, with migration before application writers.
# gmodctl status | logs [service] | compose ...
# Existing installations require a separate reviewed backup/release procedure; update is refused.
set -euo pipefail

STACK_DIR="${GMOD_STACK_DIR:-/opt/gmod-integration}"
PROJECT="${GMOD_PROJECT_NAME:-gmod}"
HELPER="$STACK_DIR/proxmox-ops.py"
COMPOSE=(docker compose --project-name "$PROJECT" --project-directory "$STACK_DIR" --env-file "$STACK_DIR/.env" -f "$STACK_DIR/docker-stack.swarm.yml" -f "$STACK_DIR/compose.proxmox.yml")

log() { printf '[gmodctl] %s\n' "$*"; }
die() { printf '[gmodctl] ERROR: %s\n' "$*" >&2; exit 1; }
apt_get() { DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 -y -q "$@"; }

install_docker() {
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    log "installing Docker Engine and Compose plugin"
    for _ in $(seq 1 60); do
      getent hosts download.docker.com >/dev/null 2>&1 && break
      sleep 2
    done
    getent hosts download.docker.com >/dev/null 2>&1 || die "Docker package host is unreachable; check outbound NAT and DNS"
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
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" >/etc/apt/sources.list.d/docker.list
    apt_get update
    apt_get install docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
  fi
  command -v python3 >/dev/null 2>&1 || apt_get install python3
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "Docker daemon is not ready"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    prepare)
      [[ $# == 0 ]] || die "prepare takes no options"
      [[ -f "$STACK_DIR/.env" && -f "$HELPER" ]] || die "the deployment bundle is incomplete"
      install_docker
      systemctl disable --now gmod-update.timer >/dev/null 2>&1 || true
      python3 "$HELPER" --stack-dir "$STACK_DIR" --project "$PROJECT" config
      log "bundle prepared; applications are not started"
      ;;
    preflight|bootstrap)
      exec python3 "$HELPER" --stack-dir "$STACK_DIR" --project "$PROJECT" "$cmd" "$@"
      ;;
    deploy|update)
      die "automatic/in-place deployment is disabled; use prepare, preflight and explicit bootstrap for a new empty installation"
      ;;
    status) "${COMPOSE[@]}" ps --all ;;
    logs) "${COMPOSE[@]}" logs -f --tail 100 "$@" ;;
    compose) "${COMPOSE[@]}" "$@" ;;
    *) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; [[ -z "$cmd" ]] || exit 1 ;;
  esac
}

main "$@"
