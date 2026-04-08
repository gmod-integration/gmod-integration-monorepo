#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
STACK_FILE="${ROOT_DIR}/docker-stack.swarm.yml"
STACK_NAME="gmod"
DEPLOY_SCRIPT="${ROOT_DIR}/scripts/swarm-deploy.sh"
RESOLVE_IMAGE="changed"
CHECK_ONLY="false"
DRY_RUN="false"
GIT_PULL="true"
PIN_DIGESTS="true"
LOCK_FILE="/tmp/gmod-swarm-auto-update.lock"

DEFAULT_API_IMAGE="ghcr.io/gmod-integration/gmod-integration-api:latest"
DEFAULT_WEBSOCKET_IMAGE="ghcr.io/gmod-integration/gmod-integration-websocket:latest"
DEFAULT_DISCORD_IMAGE="ghcr.io/gmod-integration/gmod-integration-discord:latest"

usage() {
  cat <<'USAGE'
Usage: scripts/swarm-auto-update.sh [options]

Checks published images, pulls them, and redeploys swarm stack only when at least one image digest changed.

Options:
  --env-file <path>         Env file path (default: ./.env)
  --compose-file <path>     Swarm compose file (default: ./docker-stack.swarm.yml)
  --stack-name <name>       Swarm stack name (default: gmod)
  --deploy-script <path>    Deploy script path (default: ./scripts/swarm-deploy.sh)
  --resolve-image <mode>    Deploy resolve-image: always|changed|never (default: changed)
  --git-pull                Run git pull --ff-only before image checks (default: enabled)
  --no-git-pull             Disable git pull step
  --pin-digests             Deploy using pulled image digests (default: enabled)
  --no-pin-digests          Deploy using tag references from .env/defaults
  --check-only              Check and pull images only; do not deploy
  --dry-run                 Print actions only; do not pull/deploy
  --lock-file <path>        Lock file for concurrent runs (default: /tmp/gmod-swarm-auto-update.lock)
  -h, --help                Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --compose-file)
      STACK_FILE="$2"
      shift 2
      ;;
    --stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    --deploy-script)
      DEPLOY_SCRIPT="$2"
      shift 2
      ;;
    --resolve-image)
      RESOLVE_IMAGE="$2"
      shift 2
      ;;
    --git-pull)
      GIT_PULL="true"
      shift
      ;;
    --no-git-pull)
      GIT_PULL="false"
      shift
      ;;
    --pin-digests)
      PIN_DIGESTS="true"
      shift
      ;;
    --no-pin-digests)
      PIN_DIGESTS="false"
      shift
      ;;
    --check-only)
      CHECK_ONLY="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --lock-file)
      LOCK_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$RESOLVE_IMAGE" in
  always|changed|never) ;;
  *)
    echo "Invalid --resolve-image value: $RESOLVE_IMAGE (allowed: always|changed|never)" >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$STACK_FILE" ]]; then
  echo "Stack file not found: $STACK_FILE" >&2
  exit 1
fi

if [[ ! -x "$DEPLOY_SCRIPT" ]]; then
  echo "Deploy script not executable: $DEPLOY_SCRIPT" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found in PATH" >&2
  exit 1
fi

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another update run is already in progress, skipping."
    exit 0
  fi
fi

read_env_var() {
  local key="$1"
  local file="$2"
  local line raw value

  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  raw="${line#*=}"
  value="${raw#"${raw%%[![:space:]]*}"}"
  value="${value%$'\r'}"

  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s' "$value"
}

local_digest() {
  local image="$1"
  docker image inspect --format '{{join .RepoDigests "\n"}}' "$image" 2>/dev/null | head -n1
}

API_IMAGE="$(read_env_var API_IMAGE "$ENV_FILE" || true)"
WEBSOCKET_IMAGE="$(read_env_var WEBSOCKET_IMAGE "$ENV_FILE" || true)"
DISCORD_IMAGE="$(read_env_var DISCORD_IMAGE "$ENV_FILE" || true)"

API_IMAGE="${API_IMAGE:-$DEFAULT_API_IMAGE}"
WEBSOCKET_IMAGE="${WEBSOCKET_IMAGE:-$DEFAULT_WEBSOCKET_IMAGE}"
DISCORD_IMAGE="${DISCORD_IMAGE:-$DEFAULT_DISCORD_IMAGE}"

SERVICES=("api" "websocket" "discord")
IMAGES=("$API_IMAGE" "$WEBSOCKET_IMAGE" "$DISCORD_IMAGE")
CHANGED_SERVICES=()
PINNED_IMAGES=("$API_IMAGE" "$WEBSOCKET_IMAGE" "$DISCORD_IMAGE")

echo "===== SWARM AUTO UPDATE CHECK START ====="
echo "stack: ${STACK_NAME}"
echo "env:   ${ENV_FILE}"
echo "mode:  resolve-image=${RESOLVE_IMAGE}"
echo "git:   pull=${GIT_PULL}"
echo "pin:   digests=${PIN_DIGESTS}"

if [[ "$GIT_PULL" == "true" ]]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "git command not found in PATH (required for --git-pull)" >&2
    exit 1
  fi

  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not a git repository: $ROOT_DIR" >&2
    exit 1
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] would run: git -C \"$ROOT_DIR\" pull --ff-only"
  else
    echo "-> git pull --ff-only"
    git -C "$ROOT_DIR" pull --ff-only
  fi
fi

for i in "${!SERVICES[@]}"; do
  service="${SERVICES[$i]}"
  image="${IMAGES[$i]}"
  before="$(local_digest "$image" || true)"

  echo "-> ${service}: ${image}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "   [dry-run] would pull image and compare digest"
    continue
  fi

  docker pull "$image" >/dev/null
  after="$(local_digest "$image" || true)"
  if [[ -n "$after" ]]; then
    PINNED_IMAGES[$i]="$after"
  fi

  if [[ -n "$after" && "$before" != "$after" ]]; then
    echo "   updated: ${before:-<none>} -> ${after}"
    CHANGED_SERVICES+=("$service")
  else
    echo "   unchanged"
  fi
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] would deploy only if at least one image digest changed"
  exit 0
fi

if [[ "${#CHANGED_SERVICES[@]}" -eq 0 ]]; then
  echo "No new images detected. No deploy needed."
  exit 0
fi

echo "Changed services: ${CHANGED_SERVICES[*]}"

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo "Check-only mode enabled. Skipping deploy."
  exit 0
fi

DEPLOY_RESOLVE_IMAGE="$RESOLVE_IMAGE"
if [[ "$PIN_DIGESTS" == "true" ]]; then
  DEPLOY_RESOLVE_IMAGE="never"
  echo "Deploying with pinned digests:"
  echo "  API_IMAGE=${PINNED_IMAGES[0]}"
  echo "  WEBSOCKET_IMAGE=${PINNED_IMAGES[1]}"
  echo "  DISCORD_IMAGE=${PINNED_IMAGES[2]}"

  API_IMAGE="${PINNED_IMAGES[0]}" \
  WEBSOCKET_IMAGE="${PINNED_IMAGES[1]}" \
  DISCORD_IMAGE="${PINNED_IMAGES[2]}" \
  "$DEPLOY_SCRIPT" \
    --env-file "$ENV_FILE" \
    --compose-file "$STACK_FILE" \
    --stack-name "$STACK_NAME" \
    --resolve-image "$DEPLOY_RESOLVE_IMAGE"
else
  "$DEPLOY_SCRIPT" \
    --env-file "$ENV_FILE" \
    --compose-file "$STACK_FILE" \
    --stack-name "$STACK_NAME" \
    --resolve-image "$DEPLOY_RESOLVE_IMAGE"
fi

echo "===== SWARM AUTO UPDATE CHECK FINISHED ====="
