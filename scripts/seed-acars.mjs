#!/usr/bin/env node

/**
 * ACARS/VDL2/HFDL seeder — connects to an acarshub instance on the local
 * network over Socket.IO and writes decoded datalink messages to Redis for
 * the worldmonitor ACARS panel.
 *
 * acarshub's frontend is pure Socket.IO push (no REST endpoint) and lives on
 * the `/main` namespace — connecting to the default `/` namespace yields a
 * live connection that never emits anything. On connect the server replays
 * recent history as a burst of `acars_msg_batch` events, then streams new
 * messages one at a time via `acars_msg`. This seeder collects both for a
 * bounded window and republishes the merged, deduped set.
 *
 * Env:
 *   ACARS_FEEDER_URL — e.g. http://10.0.0.190:8090 (acarshub web root)
 */

import { pathToFileURL } from 'node:url';

import { io } from 'socket.io-client';
import { loadEnvFile, runSeed } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const FEEDER_URL = process.env.ACARS_FEEDER_URL;
const KEY = 'acars:messages:v1';
const TTL = 150;
const MAX_MESSAGES = 200;
const COLLECT_WINDOW_MS = 8_000; // initial history burst arrives within ~1-2s; leaves margin
const IDLE_QUIET_MS = 1_500;     // stop early once no new event for this long

// Normalizes both acars_msg_batch entries (raw) and acars_msg entries
// (wrapped in { msghtml }) into one shape for the panel.
export function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const uid = raw.uid != null ? String(raw.uid) : null;
  if (!uid) return null;

  let libacars = null;
  if (raw.libacars) {
    try {
      libacars = typeof raw.libacars === 'string' ? JSON.parse(raw.libacars) : raw.libacars;
    } catch {
      libacars = null;
    }
  }

  return {
    uid,
    timestamp: raw.timestamp ? raw.timestamp * 1000 : null, // acarshub sends epoch seconds
    messageType: raw.message_type || null, // 'ACARS' | 'VDL-M2' | 'HFDL'
    stationId: raw.station_id || null,
    icaoHex: raw.icao_hex || raw.icao || null,
    tail: raw.tail || null,
    flight: raw.flight || null,
    iataFlight: raw.iata_flight || null,
    airline: raw.airline || null,
    label: raw.label || null,
    labelType: raw.label_type || null,
    text: raw.text || null,
    freq: raw.freq ?? null,
    level: raw.level ?? null,
    isOnground: raw.is_onground === 1,
    libacars,
    matched: raw.matched === true,
    matchedText: Array.isArray(raw.matched_text) ? raw.matched_text : [],
  };
}

async function fetchData() {
  const messages = new Map();
  let decoders = null;

  await new Promise((resolve) => {
    const socket = io(FEEDER_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      timeout: 10_000,
    });

    let idleTimer = null;
    let hardTimer = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      socket.disconnect();
      resolve();
    };

    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, IDLE_QUIET_MS);
    };

    hardTimer = setTimeout(finish, COLLECT_WINDOW_MS);

    socket.on('connect_error', (err) => {
      console.warn(`  [acars] connect_error: ${err.message}`);
      finish();
    });

    socket.on('acars_msg_batch', (payload) => {
      const batch = payload?.messages;
      if (Array.isArray(batch)) {
        for (const raw of batch) {
          const msg = normalizeMessage(raw);
          if (msg) messages.set(msg.uid, msg);
        }
      }
      resetIdle();
    });

    socket.on('acars_msg', (payload) => {
      const msg = normalizeMessage(payload?.msghtml);
      if (msg) messages.set(msg.uid, msg);
      resetIdle();
    });

    socket.on('system_status', (payload) => {
      decoders = payload?.status?.decoders || null;
      resetIdle();
    });

    socket.on('connect', () => {
      resetIdle();
    });
  });

  const sorted = [...messages.values()]
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, MAX_MESSAGES);

  console.log(`  Messages: ${sorted.length} (${messages.size} unique received)`);
  if (sorted.length > 0) {
    for (const m of sorted.slice(0, 5)) {
      console.log(`  ${m.messageType || '?'} ${(m.flight || m.tail || '?').padEnd(8)} ${m.labelType || m.label || ''}`);
    }
  }

  return {
    messages: sorted,
    decoders,
    fetchedAt: new Date().toISOString(),
  };
}

// Guard direct-run vs. import (unit tests import normalizeMessage without
// wanting a live seed run to fire on module load).
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun && !FEEDER_URL) {
  console.warn('[acars] ACARS_FEEDER_URL not set — skipping');
  process.exit(0);
}
if (isDirectRun) {
  await runSeed('acars', 'messages', KEY, fetchData, {
    ttlSeconds: TTL,
    lockTtlMs: 30_000,
    // Array.isArray passes even for an empty batch — ACARS/VDL2 traffic is
    // genuinely intermittent, so zero messages is a valid publish, not a retry.
    validateFn: data => Array.isArray(data?.messages),
    recordCount: data => data.messages.length,
  });
}
