#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { prepareSelfHostedRuntime } from './selfhost-prepare.mjs';
import { createLocalApiServer } from '../src-tauri/sidecar/local-api-server.mjs';

async function main() {
  await prepareSelfHostedRuntime(console);

  const app = await createLocalApiServer();
  await app.start();

  const shutdown = async (signal) => {
    console.log(`[selfhost] shutting down on ${signal}`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error('[selfhost] startup failed', error);
    process.exit(1);
  });
}
