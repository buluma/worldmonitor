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

SEED_PARALLEL="${SEED_PARALLEL:-4}"
RESULTS_DIR=$(mktemp -d)
old_trap=$(trap -p EXIT | sed "s/^trap -- '//;s/' EXIT$//")
trap "rm -rf '$RESULTS_DIR'; $old_trap" EXIT

run_and_record() {
  f="$1"
  name="$(basename "$f")"
  output=$(run_seed "$f")
  rc=$?
  last=$(echo "$output" | tail -1)

  if caps_seed "$f" && { [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; }; then
    printf "→ %s ... TIMEOUT (killed after %ss)\n" "$name" "$SEED_TIMEOUT"
    echo "TIMEOUT $f" > "$RESULTS_DIR/$name"
  elif echo "$last" | grep -qi "skip\|not set\|missing.*key\|not found"; then
    printf "→ %s ... SKIP (%s)\n" "$name" "$last"
    echo "SKIP" > "$RESULTS_DIR/$name"
  elif [ $rc -eq 0 ]; then
    printf "→ %s ... OK\n" "$name"
    echo "OK" > "$RESULTS_DIR/$name"
  else
    printf "→ %s ... FAIL (%s)\n" "$name" "$last"
    echo "FAIL $f" > "$RESULTS_DIR/$name"
  fi
}

running=0
for f in "$SCRIPT_DIR"/seed-*.mjs; do
  if [ "$SEED_PARALLEL" -le 1 ] 2>/dev/null; then
    run_and_record "$f"
  else
    run_and_record "$f" &
    running=$((running + 1))
    if [ "$running" -ge "$SEED_PARALLEL" ]; then
      wait -n 2>/dev/null || wait
      running=$((running - 1))
    fi
  fi
done
wait

ok=0 fail=0 skip=0 timedout=0
failed_files=""
for r in "$RESULTS_DIR"/*; do
  [ -f "$r" ] || continue
  line=$(cat "$r")
  result=$(echo "$line" | cut -d' ' -f1)
  fpath=$(echo "$line" | cut -d' ' -f2-)
  case "$result" in
    OK) ok=$((ok + 1)) ;;
    SKIP) skip=$((skip + 1)) ;;
    TIMEOUT) timedout=$((timedout + 1)); failed_files="$failed_files $fpath" ;;
    FAIL) fail=$((fail + 1)); failed_files="$failed_files $fpath" ;;
  esac
done

# Retry failed seeders once
if [ -n "$failed_files" ]; then
  echo ""
  echo "Retrying $(echo "$failed_files" | wc -w | tr -d ' ') failed seeder(s)..."
  for f in $failed_files; do
    name="$(basename "$f")"
    printf "  ↻ %s ... " "$name"
    output=$(run_seed "$f")
    rc=$?
    last=$(echo "$output" | tail -1)
    if [ $rc -eq 0 ] && ! echo "$last" | grep -qi "skip\|not set\|missing"; then
      printf "OK (recovered)\n"
      fail=$((fail - 1))
      ok=$((ok + 1))
    else
      printf "FAIL again\n"
    fi
  done
fi

echo ""
SUMMARY="Done: $ok ok, $skip skipped, $fail failed, $timedout timed out"
echo "$SUMMARY"

# Send summary to Telegram if configured
ALERT_TOKEN="${ALERT_TELEGRAM_BOT_TOKEN:-}"
ALERT_CHAT="${ALERT_TELEGRAM_CHAT_ID:-}"
if [ -n "$ALERT_TOKEN" ] && [ -n "$ALERT_CHAT" ] && [ "$fail" -gt 0 ] || [ "$timedout" -gt 0 ]; then
  if [ -n "$ALERT_TOKEN" ] && [ -n "$ALERT_CHAT" ]; then
    MSG="🌍 *Seeder Run*: $SUMMARY"
    curl -s -X POST "https://api.telegram.org/bot${ALERT_TOKEN}/sendMessage" \
      -d chat_id="$ALERT_CHAT" \
      -d text="$MSG" \
      -d parse_mode="Markdown" \
      > /dev/null 2>&1
  fi
fi
