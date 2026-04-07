#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
BACKUP_DIR="${ROOT_DIR}/backup"
STACK_NAME="gmod"
RETENTION_MINUTES=1440

BACKUP_MARIADB=false
BACKUP_MONGO=false
BACKUP_REDIS=false
BACKUP_MINIO=false

usage() {
  cat <<'USAGE'
Usage: scripts/swarm-backup.sh [options]

Options:
  --all                     Backup MariaDB + MongoDB + Redis + MinIO (default when none selected)
  --mariadb, --maria        Backup MariaDB only
  --mongo                   Backup MongoDB only
  --redis                   Backup Redis only
  --minio                   Backup MinIO only
  --stack-name <name>       Swarm stack namespace (default: gmod)
  --env-file <path>         Env file path (default: ./.env)
  --backup-dir <path>       Output backup directory (default: ./backup)
  --keep-partial-hours <n>  Delete non-full backups older than n hours (default: 24)
  -h, --help                Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      BACKUP_MARIADB=true
      BACKUP_MONGO=true
      BACKUP_REDIS=true
      BACKUP_MINIO=true
      shift
      ;;
    --mariadb|--maria)
      BACKUP_MARIADB=true
      shift
      ;;
    --mongo)
      BACKUP_MONGO=true
      shift
      ;;
    --redis)
      BACKUP_REDIS=true
      shift
      ;;
    --minio)
      BACKUP_MINIO=true
      shift
      ;;
    --stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --keep-partial-hours)
      RETENTION_MINUTES="$(( $2 * 60 ))"
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

if [[ "$BACKUP_MARIADB" == false && "$BACKUP_MONGO" == false && "$BACKUP_REDIS" == false && "$BACKUP_MINIO" == false ]]; then
  BACKUP_MARIADB=true
  BACKUP_MONGO=true
  BACKUP_REDIS=true
  BACKUP_MINIO=true
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found in PATH" >&2
  exit 1
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

resolve_container_id() {
  local service="$1"
  local cid

  cid="$(docker ps \
    --filter "label=com.docker.swarm.service.name=${STACK_NAME}_${service}" \
    --format '{{.ID}}' | head -n1)"

  if [[ -n "$cid" ]]; then
    printf '%s' "$cid"
    return 0
  fi

  # Fallback for old non-swarm names.
  cid="$(docker ps --filter "name=^${service}$" --format '{{.ID}}' | head -n1)"
  if [[ -n "$cid" ]]; then
    printf '%s' "$cid"
    return 0
  fi

  return 1
}

resolve_container_name() {
  local cid="$1"
  docker ps --filter "id=${cid}" --format '{{.Names}}' | head -n1
}

DATE="$(date +"%Y-%m-%d_%H-%M-%S")"
TMP_DIR="${BACKUP_DIR}/tmp_${DATE}"
mkdir -p "$TMP_DIR"

echo "===== SWARM BACKUP START ${DATE} ====="
echo "Stack: ${STACK_NAME}"
echo "Env file: ${ENV_FILE}"
echo "Backup dir: ${BACKUP_DIR}"

if [[ "$BACKUP_MARIADB" == true ]]; then
  echo "-> MariaDB"
  MARIADB_ROOT_PASSWORD="$(read_env_var "MARIADB_ROOT_PASSWORD" "$ENV_FILE" || true)"
  if [[ -z "${MARIADB_ROOT_PASSWORD}" ]]; then
    MARIADB_ROOT_PASSWORD="$(read_env_var "MARIA_ROOT_PASSWORD" "$ENV_FILE" || true)"
  fi
  if [[ -z "${MARIADB_ROOT_PASSWORD}" ]]; then
    echo "Missing MARIA_ROOT_PASSWORD/MARIADB_ROOT_PASSWORD in ${ENV_FILE}" >&2
    exit 1
  fi

  MARIADB_CONTAINER_ID="$(resolve_container_id mariadb || true)"
  if [[ -z "${MARIADB_CONTAINER_ID}" ]]; then
    echo "MariaDB container not found (stack=${STACK_NAME})" >&2
    exit 1
  fi
  MARIADB_CONTAINER_NAME="$(resolve_container_name "$MARIADB_CONTAINER_ID")"
  echo "   container: ${MARIADB_CONTAINER_NAME}"

  docker exec -e MYSQL_PWD="${MARIADB_ROOT_PASSWORD}" "${MARIADB_CONTAINER_ID}" sh -lc \
    'if command -v mariadb-dump >/dev/null 2>&1; then
       mariadb-dump -uroot --all-databases --single-transaction --quick --lock-tables=false --routines --triggers --events
     else
       mysqldump -uroot --all-databases --single-transaction --quick --lock-tables=false --routines --triggers --events
     fi' > "${TMP_DIR}/mariadb.sql"
fi

if [[ "$BACKUP_MONGO" == true ]]; then
  echo "-> MongoDB"
  MONGO_CONTAINER_ID="$(resolve_container_id mongo || true)"
  if [[ -z "${MONGO_CONTAINER_ID}" ]]; then
    echo "MongoDB container not found (stack=${STACK_NAME})" >&2
    exit 1
  fi
  MONGO_CONTAINER_NAME="$(resolve_container_name "$MONGO_CONTAINER_ID")"
  echo "   container: ${MONGO_CONTAINER_NAME}"

  docker exec "${MONGO_CONTAINER_ID}" sh -lc 'mongodump --archive' > "${TMP_DIR}/mongo.archive"
fi

if [[ "$BACKUP_REDIS" == true ]]; then
  echo "-> Redis"
  REDIS_CONTAINER_ID="$(resolve_container_id redis || true)"
  if [[ -z "${REDIS_CONTAINER_ID}" ]]; then
    echo "Redis container not found (stack=${STACK_NAME})" >&2
    exit 1
  fi
  REDIS_CONTAINER_NAME="$(resolve_container_name "$REDIS_CONTAINER_ID")"
  echo "   container: ${REDIS_CONTAINER_NAME}"

  REDIS_LASTSAVE_BEFORE="$(docker exec "${REDIS_CONTAINER_ID}" redis-cli LASTSAVE | tr -d '\r')"
  docker exec "${REDIS_CONTAINER_ID}" redis-cli BGSAVE >/dev/null

  for _ in $(seq 1 30); do
    REDIS_LASTSAVE_AFTER="$(docker exec "${REDIS_CONTAINER_ID}" redis-cli LASTSAVE | tr -d '\r')"
    if [[ "${REDIS_LASTSAVE_AFTER}" != "${REDIS_LASTSAVE_BEFORE}" ]]; then
      break
    fi
    sleep 2
  done

  docker cp "${REDIS_CONTAINER_ID}:/data/dump.rdb" "${TMP_DIR}/redis.rdb"
fi

if [[ "$BACKUP_MINIO" == true ]]; then
  echo "-> MinIO"
  MINIO_CONTAINER_ID="$(resolve_container_id minio || true)"
  if [[ -z "${MINIO_CONTAINER_ID}" ]]; then
    echo "MinIO container not found (stack=${STACK_NAME})" >&2
    exit 1
  fi
  MINIO_CONTAINER_NAME="$(resolve_container_name "$MINIO_CONTAINER_ID")"
  echo "   container: ${MINIO_CONTAINER_NAME}"

  mkdir -p "${TMP_DIR}/minio_data"
  docker cp "${MINIO_CONTAINER_ID}:/data/." "${TMP_DIR}/minio_data/"
  tar -czf "${TMP_DIR}/minio.tar.gz" -C "${TMP_DIR}/minio_data" .
  rm -rf "${TMP_DIR}/minio_data"
fi

cat > "${TMP_DIR}/metadata.txt" <<EOF
created_at=${DATE}
stack_name=${STACK_NAME}
host=$(hostname)
selected_components=mariadb:${BACKUP_MARIADB},mongo:${BACKUP_MONGO},redis:${BACKUP_REDIS},minio:${BACKUP_MINIO}
EOF

BACKUP_LABEL=""
if [[ "$BACKUP_MARIADB" == true && "$BACKUP_MONGO" == true && "$BACKUP_REDIS" == true && "$BACKUP_MINIO" == true ]]; then
  BACKUP_LABEL="full"
else
  [[ "$BACKUP_MARIADB" == true ]] && BACKUP_LABEL="${BACKUP_LABEL:+${BACKUP_LABEL}-}mariadb"
  [[ "$BACKUP_MONGO" == true ]] && BACKUP_LABEL="${BACKUP_LABEL:+${BACKUP_LABEL}-}mongo"
  [[ "$BACKUP_REDIS" == true ]] && BACKUP_LABEL="${BACKUP_LABEL:+${BACKUP_LABEL}-}redis"
  [[ "$BACKUP_MINIO" == true ]] && BACKUP_LABEL="${BACKUP_LABEL:+${BACKUP_LABEL}-}minio"
fi

mkdir -p "$BACKUP_DIR"
ARCHIVE_PATH="${BACKUP_DIR}/gmod_backup_${BACKUP_LABEL}_${DATE}.tar.gz"
tar -czf "${ARCHIVE_PATH}" -C "${TMP_DIR}" .
rm -rf "${TMP_DIR}"

echo "Archive created:"
echo "${ARCHIVE_PATH}"

echo "Cleaning non-full backups older than $((RETENTION_MINUTES / 60))h..."
find "${BACKUP_DIR}" -name "gmod_backup_*.tar.gz" -type f ! -name "*full*" -mmin "+${RETENTION_MINUTES}" -delete

echo "===== SWARM BACKUP FINISHED ====="
