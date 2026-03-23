#!/usr/bin/env node

// Railway compatibility shim:
// - repo-root deploys run `node scripts/ais-relay.cjs`
// - scripts-root deploys may still run `node scripts/ais-relay.cjs`,
//   which resolves to `/app/scripts/ais-relay.cjs`
// In the latter case, the real entrypoint lives one directory up.
require('../ais-relay.cjs');
