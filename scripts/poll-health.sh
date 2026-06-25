#!/usr/bin/env bash
# Poll /api/health and alert via Telegram on degraded status.
# Sends a heartbeat on every run so silence = dead system.
#
# Env:
#   WM_HEALTH_URL           — health endpoint (default: http://localhost:4000/api/health)
#   ALERT_TELEGRAM_BOT_TOKEN — Telegram bot token
#   ALERT_TELEGRAM_CHAT_ID   — Telegram chat ID
#
# Crontab example (every 15 min):
#   */15 * * * * /path/to/scripts/poll-health.sh >> /tmp/wm-health-poll.log 2>&1

set -euo pipefail

HEALTH_URL="${WM_HEALTH_URL:-http://localhost:4000/api/health}"
BOT_TOKEN="${ALERT_TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${ALERT_TELEGRAM_CHAT_ID:-}"

send_telegram() {
  local msg="$1"
  if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -d chat_id="$CHAT_ID" \
      -d text="$msg" \
      -d parse_mode="Markdown" \
      > /dev/null 2>&1
  fi
}

RESPONSE=$(curl -s -w '\n%{http_code}' --max-time 15 "$HEALTH_URL" 2>/dev/null || echo -e '\n000')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "000" ]; then
  echo "$(date -Iseconds) UNREACHABLE"
  send_telegram "🔴 *Health Poll*: ${HEALTH_URL} unreachable"
  exit 1
fi

STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','UNKNOWN'))" 2>/dev/null || echo "PARSE_ERROR")
SUMMARY=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d.get('summary',{})
print('OK=%s WARN=%s CRIT=%s' % (s.get('ok',0), s.get('warn',0), s.get('crit',0)))
" 2>/dev/null || echo "?")

echo "$(date -Iseconds) HTTP=$HTTP_CODE STATUS=$STATUS $SUMMARY"

case "$STATUS" in
  HEALTHY)
    # Heartbeat — silence from this script = dead system
    ;;
  DEGRADED|UNHEALTHY)
    send_telegram "⚠️ *Health Poll*: $STATUS ($SUMMARY)"
    ;;
  *)
    send_telegram "❓ *Health Poll*: unexpected status $STATUS (HTTP $HTTP_CODE)"
    ;;
esac
