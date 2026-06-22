#!/usr/bin/env bash
set -euo pipefail

# Deploy World Monitor to heimdal (Raspberry Pi @ 100.110.136.4)
# Usage: ./deploy/heimdal.sh [--seed]

REMOTE_USER="heimdal"
REMOTE_HOST="100.110.136.4"
REMOTE_DIR="/home/heimdal/Documents/Heimdal/worldmonitor"
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

SEED=false
if [[ "${1:-}" == "--seed" ]]; then
  SEED=true
fi

echo "==> Pulling latest on heimdal..."
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && git pull origin master"

echo "==> Building and starting containers..."
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose up -d --build"

if $SEED; then
  echo "==> Running seeders..."
  ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && ./scripts/run-seeders.sh"
fi

echo "==> Checking container health..."
ssh "${SSH_TARGET}" "cd ${REMOTE_DIR} && docker compose ps"

echo "==> Done. World Monitor available at http://${REMOTE_HOST}:4000"
