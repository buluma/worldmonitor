#!/bin/sh
# Run all seed scripts against configured Redis, falling back to the local
# Redis REST proxy when no explicit credentials are available.
# Usage: ./scripts/run-seeders.sh
#
# If the local worldmonitor stack is running, the Redis REST proxy listens on
# localhost:8079 by default.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_LOCAL="$PROJECT_DIR/.env.local"
LOCKFILE="/tmp/wm-seeders.lock"

if [ -f "$LOCKFILE" ]; then
  pid=$(cat "$LOCKFILE" 2>/dev/null)
  if kill -0 "$pid" 2>/dev/null; then
    echo "Seeder already running (pid $pid) — skipping"
    exit 0
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT INT TERM

# Prefer real repo credentials when present so host-run seeders can write to the
# same backend the app uses. Only populate keys that are currently unset.
if [ -f "$ENV_LOCAL" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)
        eval "current=\${$key}"
        if [ -z "$current" ]; then
          value=$(printf '%s' "$value" | sed "s/^['\"]//; s/['\"]$//")
          export "$key=$value"
        fi
        ;;
    esac
  done < "$ENV_LOCAL"
fi

UPSTASH_REDIS_REST_URL="${UPSTASH_REDIS_REST_URL:-http://localhost:8079}"
UPSTASH_REDIS_REST_TOKEN="${UPSTASH_REDIS_REST_TOKEN:-wm-local-token}"
export UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN

# Source API keys: prefer .env.seeders (clean key=value), fall back to
# parsing docker-compose.override.yml (fragile with special chars).
ENV_SEEDERS="$PROJECT_DIR/.env.seeders"
if [ -f "$ENV_SEEDERS" ]; then
  set -a
  . "$ENV_SEEDERS"
  set +a
fi

OVERRIDE="$PROJECT_DIR/docker-compose.override.yml"
if [ -f "$OVERRIDE" ] && [ ! -f "$ENV_SEEDERS" ]; then
  _env_tmp=$(mktemp)
  grep -E '^\s+[A-Z_]+:' "$OVERRIDE" \
    | grep -v '#' \
    | sed 's/^\s*//' \
    | sed 's/: */=/' \
    | sed "s/[\"']//g" \
    | grep -E '^(NASA_FIRMS|GROQ|AISSTREAM|FRED|FINNHUB|EIA|ACLED_ACCESS_TOKEN|ACLED_EMAIL|ACLED_PASSWORD|CLOUDFLARE|AVIATIONSTACK|OPENROUTER_API_KEY|LLM_API_URL|LLM_API_KEY|LLM_MODEL|OLLAMA_API_URL|OLLAMA_MODEL|WTO_API_KEY|WM_API_BASE_URL)' \
    | sed 's/^/export /' > "$_env_tmp"
  . "$_env_tmp"
  rm -f "$_env_tmp"
fi
# Default warm-ping target to local API when running against local Redis
if [ "$UPSTASH_REDIS_REST_URL" = "http://localhost:8079" ] && [ -z "$WM_API_BASE_URL" ]; then
  export WM_API_BASE_URL="http://localhost:4000"
fi
SEED_TIMEOUT="${SEED_TIMEOUT:-1800}"

if command -v timeout >/dev/null 2>&1 && [ "${SEED_TIMEOUT:-0}" -gt 0 ] 2>/dev/null; then
  timeout_enabled=true
else
  timeout_enabled=false
fi

is_bundle() {
  case "$1" in
    *seed-bundle-*) return 0 ;;
    *) return 1 ;;
  esac
}

caps_seed() {
  [ "$timeout_enabled" = true ] && ! is_bundle "$1"
}

run_seed() {
  if caps_seed "$1"; then
    timeout -k 30 "$SEED_TIMEOUT" node "$1" 2>&1
  else
    node "$1" 2>&1
  fi
}

ok=0 fail=0 skip=0 timedout=0

for f in "$SCRIPT_DIR"/seed-*.mjs; do
  name="$(basename "$f")"
  printf "→ %s ... " "$name"
  output=$(run_seed "$f")
  rc=$?
  last=$(echo "$output" | tail -1)

  if caps_seed "$f" && { [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; }; then
    printf "TIMEOUT (killed after %ss)\n" "$SEED_TIMEOUT"
    timedout=$((timedout + 1))
  elif echo "$last" | grep -qi "skip\|not set\|missing.*key\|not found"; then
    printf "SKIP (%s)\n" "$last"
    skip=$((skip + 1))
  elif [ $rc -eq 0 ]; then
    printf "OK\n"
    ok=$((ok + 1))
  else
    printf "FAIL (%s)\n" "$last"
    fail=$((fail + 1))
  fi
done

echo ""
echo "Done: $ok ok, $skip skipped, $fail failed, $timedout timed out"
