#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadEnvFile } from './_seed-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBCAM_ACTIVE_KEY = 'webcam:cameras:active';

function getCacheBackend() {
  return (process.env.WM_CACHE_BACKEND || '').trim().toLowerCase();
}

function resolveLocalCacheFile() {
  return (process.env.WM_LOCAL_CACHE_FILE || '').trim() || resolve(process.cwd(), '.worldmonitor-cache.json');
}

function isExpired(expiresAt) {
  return typeof expiresAt === 'number' && expiresAt <= Date.now();
}

function readLocalStore(cacheFile) {
  if (!existsSync(cacheFile)) return null;
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf-8'));
  } catch {
    return null;
  }
}

function readKvValue(store, key) {
  const entry = store?.kv?.[key];
  if (!entry || isExpired(entry.expiresAt)) return null;
  return typeof entry.value === 'string' ? entry.value : null;
}

function hasLiveGeo(store, key) {
  const entry = store?.geos?.[key];
  return !!entry && !isExpired(entry.expiresAt) && entry.members && Object.keys(entry.members).length > 0;
}

function hasLiveHash(store, key) {
  const entry = store?.hashes?.[key];
  return !!entry && !isExpired(entry.expiresAt) && entry.fields && Object.keys(entry.fields).length > 0;
}

export function getWebcamSeedStatus() {
  if (getCacheBackend() !== 'local-file') {
    return { ready: true, reason: 'unsupported-backend', cacheFile: null, version: null };
  }

  const cacheFile = resolveLocalCacheFile();
  const store = readLocalStore(cacheFile);
  if (!store) {
    return { ready: false, reason: 'missing-cache-file', cacheFile, version: null };
  }

  const version = readKvValue(store, WEBCAM_ACTIVE_KEY);
  if (!version) {
    return { ready: false, reason: 'missing-active-pointer', cacheFile, version: null };
  }

  const geoKey = `webcam:cameras:geo:${version}`;
  const metaKey = `webcam:cameras:meta:${version}`;
  if (!hasLiveGeo(store, geoKey)) {
    return { ready: false, reason: 'missing-geo-index', cacheFile, version };
  }
  if (!hasLiveHash(store, metaKey)) {
    return { ready: false, reason: 'missing-metadata-hash', cacheFile, version };
  }

  return { ready: true, reason: 'ready', cacheFile, version };
}

function runNodeScript(scriptPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: resolve(__dirname, '..'),
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptPath} terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

export async function ensureWebcamSeed(log = console) {
  const status = getWebcamSeedStatus();
  if (status.ready) {
    if (status.reason === 'ready') {
      log.log(`[selfhost] Webcam seed ready (${status.version})`);
    }
    return status;
  }

  if (getCacheBackend() !== 'local-file') {
    return status;
  }

  if (!process.env.WINDY_API_KEY) {
    log.warn(`[selfhost] Webcam seed missing (${status.reason}) but WINDY_API_KEY is not configured`);
    return status;
  }

  log.log(`[selfhost] Webcam seed missing (${status.reason}) — running seed-webcams.mjs`);
  const scriptPath = resolve(__dirname, 'seed-webcams.mjs');
  const exitCode = await runNodeScript(scriptPath);
  if (exitCode !== 0) {
    throw new Error(`seed-webcams.mjs exited with code ${exitCode}`);
  }

  const after = getWebcamSeedStatus();
  if (!after.ready) {
    throw new Error(`webcam seed verification failed after seed run (${after.reason})`);
  }
  log.log(`[selfhost] Webcam seed initialized (${after.version})`);
  return after;
}

export async function prepareSelfHostedRuntime(log = console) {
  loadEnvFile(import.meta.url);
  await ensureWebcamSeed(log);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  prepareSelfHostedRuntime().catch((error) => {
    console.error('[selfhost] prepare failed', error);
    process.exit(1);
  });
}
