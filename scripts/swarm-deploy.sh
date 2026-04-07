#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
STACK_FILE="${ROOT_DIR}/docker-stack.swarm.yml"
STACK_NAME="gmod"
RESOLVE_IMAGE="always"
DRY_RUN="false"

usage() {
  cat <<'USAGE'
Usage: scripts/swarm-deploy.sh [options]

Options:
  -e, --env-file <path>      Env file to read (default: ./.env)
  -c, --compose-file <path>  Swarm compose file (default: ./docker-stack.swarm.yml)
  -s, --stack-name <name>    Docker stack name (default: gmod)
      --resolve-image <mode> Docker stack resolve mode: always|changed|never (default: always)
      --dry-run              Print resolved values and deployment command only
  -h, --help                 Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    -c|--compose-file)
      STACK_FILE="$2"
      shift 2
      ;;
    -s|--stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    --resolve-image)
      RESOLVE_IMAGE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
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

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$STACK_FILE" ]]; then
  echo "Stack file not found: $STACK_FILE" >&2
  exit 1
fi

case "$RESOLVE_IMAGE" in
  always|changed|never) ;;
  *)
    echo "Invalid --resolve-image value: $RESOLVE_IMAGE" >&2
    echo "Allowed: always | changed | never" >&2
    exit 1
    ;;
esac

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

load_required() {
  local key="$1"
  local value
  if ! value="$(read_env_var "$key" "$ENV_FILE")"; then
    echo "Missing required key in $ENV_FILE: $key" >&2
    exit 1
  fi
  if [[ -z "$value" ]]; then
    echo "Empty required key in $ENV_FILE: $key" >&2
    exit 1
  fi
  export "$key=$value"
}

load_optional() {
  local key="$1"
  local value
  if value="$(read_env_var "$key" "$ENV_FILE")"; then
    if [[ -n "$value" ]]; then
      export "$key=$value"
    fi
  fi
}

load_required_with_fallback() {
  local primary_key="$1"
  local fallback_key="$2"
  local value

  if value="$(read_env_var "$primary_key" "$ENV_FILE")" && [[ -n "$value" ]]; then
    export "$primary_key=$value"
    return 0
  fi

  if value="$(read_env_var "$fallback_key" "$ENV_FILE")" && [[ -n "$value" ]]; then
    export "$primary_key=$value"
    return 0
  fi

  echo "Missing required key in $ENV_FILE: ${primary_key} (or ${fallback_key})" >&2
  exit 1
}

# Required for Traefik host-rule interpolation in docker-stack.swarm.yml
load_required API_HOST
load_required WS_HOST
load_required TRAEFIK_DASHBOARD_HOST

# Required for stateful services interpolation in docker-stack.swarm.yml
load_required_with_fallback MARIA_USER MARIADB_USER
load_required_with_fallback MARIA_PASSWORD MARIADB_PASSWORD
load_required_with_fallback MARIA_NAME MARIADB_DATABASE
load_required_with_fallback MARIA_ROOT_PASSWORD MARIADB_ROOT_PASSWORD
load_required MINIO_ACCESS_KEY
load_required MINIO_SECRET_KEY

# Export compatibility aliases for templates and tools.
export MARIADB_USER="$MARIA_USER"
export MARIADB_PASSWORD="$MARIA_PASSWORD"
export MARIADB_DATABASE="$MARIA_NAME"
export MARIADB_ROOT_PASSWORD="$MARIA_ROOT_PASSWORD"

# Optional image overrides
load_optional API_IMAGE
load_optional WEBSOCKET_IMAGE
load_optional DISCORD_IMAGE

echo "Deploying stack '$STACK_NAME'"
echo "  env file:        $ENV_FILE"
echo "  compose file:    $STACK_FILE"
echo "  API_HOST:        $API_HOST"
echo "  WS_HOST:         $WS_HOST"
echo "  DASHBOARD_HOST:  $TRAEFIK_DASHBOARD_HOST"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry-run enabled, command not executed."
  echo "docker stack deploy -c $STACK_FILE --with-registry-auth --prune --resolve-image $RESOLVE_IMAGE $STACK_NAME"
  exit 0
fi

docker stack deploy \
  -c "$STACK_FILE" \
  --with-registry-auth \
  --prune \
  --resolve-image "$RESOLVE_IMAGE" \
  "$STACK_NAME"
