# Desktop API Fallback — Deployment Guide

## Overview

Desktop cloud fallback is no longer gated on a World Monitor license key. The desktop app tries the sidecar first and falls back to cloud APIs when appropriate. Provider-specific API keys are still configured individually.

## Architecture

```
Desktop App                          Cloud (Vercel)
┌──────────────────┐                ┌──────────────────────┐
│ fetch('/api/...')│                │ api/[domain]/v1/[rpc]│
│        │         │                │        │              │
│ ┌──────▼───────┐ │                │ ┌──────▼───────┐      │
│ │ sidecar try  │ │                │ │ validateApiKey│      │
│ │ (local-first)│ │                │ │ (origin-aware)│      │
│ └──────┬───────┘ │                │ └──────┬───────┘      │
│   fail │         │                │   401 if invalid      │
│ ┌──────▼───────┐ │   fallback    │                       │
│ │ cloud fallback│─┼──────────────►│ ┌──────────────┐      │
│ │ decision      │ │               │ │ route handler │      │
│ └──────────────┘ │               │ └──────────────┘      │
└──────────────────┘               └──────────────────────┘
```

## Required Environment Variables

### Vercel

| Variable | Description | Example |
|----------|-------------|---------|
| `CONVEX_URL` | Convex deployment URL (from `npx convex deploy`) | `https://xyz-123.convex.cloud` |

## Convex Setup

### First-time deployment

```bash
# 1. Install (already in package.json)
npm install

# 2. Login to Convex
npx convex login

# 3. Initialize project (creates .env.local with CONVEX_URL)
npx convex init

# 4. Deploy schema and functions
npx convex deploy

# 5. Copy the deployment URL to Vercel env vars
# The URL is printed by `npx convex deploy` and saved in .env.local
```

### Verify Convex deployment

```bash
# Typecheck Convex functions
npx convex dev --typecheck

# Open Convex dashboard to see registrations
npx convex dashboard
```

### Schema

The `registrations` table stores:

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | Original email (for display) |
| `normalizedEmail` | string | Lowercased email (for dedup) |
| `registeredAt` | number | Unix timestamp |
| `source` | string? | Where the registration came from |
| `appVersion` | string? | Desktop app version |

Indexed by `normalizedEmail` for duplicate detection.

## Security Model

### Client-side (desktop app)

- `installRuntimeFetchPatch()` allows cloud fallback for non-local-only endpoints
- Provider secrets still control whether individual data sources are available
- Local-only endpoints remain blocked from cloud fallback

### Server-side (Vercel edge)

- Route-level provider auth still applies where upstream APIs require it
- Desktop origins use the same application routes as web for cloud fallback

### CORS

Standard application headers are allowed in both `server/cors.ts` and `api/_cors.js`.

## Verification Checklist

After deployment:

- [ ] Set `CONVEX_URL` in Vercel
- [ ] Run `npx convex deploy` to push schema
- [ ] Desktop without provider keys: feature-specific fallbacks behave correctly
- [ ] Desktop with invalid key: sebuf requests get `401`
- [ ] Desktop with valid key: cloud fallback works as before
- [ ] Web access: no key required, works normally
- [ ] Registration form: submit email, check Convex dashboard
- [ ] Duplicate email: shows "already registered"
- [ ] Existing settings tabs (LLMs, API Keys, Debug) unchanged

## Files Reference

| File | Role |
|------|------|
| `src/services/runtime.ts` | Desktop local-first fetch with cloud fallback |
| `src/services/runtime-config.ts` | Provider secret loading, validation, and `secretsReady` |
| `api/[domain]/v1/[rpc].ts` | Sebuf gateway routing |
| `api/register-interest.js` | Optional registration endpoint → Convex |
| `server/cors.ts` / `api/_cors.js` | CORS headers |
| `convex/schema.ts` | Convex DB schema |
| `convex/registerInterest.ts` | Convex mutation |
