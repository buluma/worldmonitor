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

# Source API keys from docker-compose.override.yml if present.
# These keys are configured for the container but seeders run on the host.
OVERRIDE="$PROJECT_DIR/docker-compose.override.yml"
if [ -f "$OVERRIDE" ]; then
  _env_tmp=$(mktemp)
  grep -E '^\s+[A-Z_]+:' "$OVERRIDE" \
    | grep -v '#' \
    | sed 's/^\s*//' \
    | sed 's/: */=/' \
    | sed "s/[\"']//g" \
    | grep -E '^(NASA_FIRMS|GROQ|AISSTREAM|FRED|FINNHUB|EIA|ACLED_ACCESS_TOKEN|ACLED_EMAIL|ACLED_PASSWORD|CLOUDFLARE|AVIATIONSTACK|OPENROUTER_API_KEY|LLM_API_URL|LLM_API_KEY|LLM_MODEL|OLLAMA_API_URL|OLLAMA_MODEL)' \
    | sed 's/^/export /' > "$_env_tmp"
  . "$_env_tmp"
  rm -f "$_env_tmp"
fi
ok=0 fail=0 skip=0

for f in "$SCRIPT_DIR"/seed-*.mjs; do
  name="$(basename "$f")"
  printf "→ %s ... " "$name"
  output=$(node "$f" 2>&1)
  rc=$?
  last=$(echo "$output" | tail -1)

  if echo "$last" | grep -qi "skip\|not set\|missing.*key\|not found"; then
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
echo "Done: $ok ok, $skip skipped, $fail failed"
