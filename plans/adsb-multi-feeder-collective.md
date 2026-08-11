# Plan: Multi-Feeder ADS-B Collective Dashboard

## Context

Single-feeder Local ADS-B panel is live (feeder Pi at `10.0.0.190`, Nairobi —
see `[[adsb-feeder]]` memory, `scripts/seed-local-adsb.mjs`,
`src/components/LocalAdsbPanel.ts`). You now have **4 feeders total**, all
reachable on the same LAN/Tailscale as heimdal, running **mixed software**
(readsb/ultrafeeder on at least one, unknown/other stacks on the rest — first
task of the next session is inventorying what's actually running on each).

Goal: one collective dashboard combining all 4 feeders — merged aircraft
track (dedup a plane seen by 2+ feeders into one dot), per-feeder coverage
rings, and a receiver-health strip (msg/min, noise, gain per feeder) instead
of 4 separate single-feeder panels.

---

## Step 0 — Inventory (do this first, on the ground)

For each of the 3 new feeders, from heimdal:
```bash
curl -s http://<feeder-ip>:8080/data/aircraft.json | head -c 200   # readsb/dump1090-fa style
curl -s http://<feeder-ip>/data/aircraft.json | head -c 200         # some ship it on :80
curl -s http://<feeder-ip>:30003 2>&1 | head -c 200                 # SBS-1 raw feed (netcat, not curl)
```
Record per feeder: IP, port, JSON shape (readsb/dump1090-fa `aircraft.json`
vs FlightAware SkyAware `data/aircraft.json` vs `tar1090`'s own extended
schema vs raw SBS/BEAST), lat/lon/alt of the antenna, approx range.

**Gotcha already hit once this project:** don't trust a memory note's port
list — the ADS-B panel's ACARS phase assumed TCP 15550/15555/15556 were open
externally; they were Docker-internal only, and the *actual* live protocol
turned out to be Socket.IO on a completely different port (8090) with a
non-default namespace (`/main`). Verify every endpoint live with curl/probe
before writing the seeder — don't extrapolate from what one feeder exposes.

## Step 1 — Normalize to one shape

Different stacks emit different field names for the same data
(`alt_baro` vs `altitude`, `gs` vs `speed`, `flight` vs `callsign`...). Write
one adapter per stack type, each producing the existing `LocalAircraft` shape
from `src/components/LocalAdsbPanel.ts`:
```ts
{ hex, callsign, lat, lon, altBaro, altGeom, gs, track, vertRate, squawk,
  category, type, registration, onGround, rssi, seen, messages }
```
Adapters live in `scripts/lib/adsb-adapters/` (new dir) — one function per
stack, e.g. `fromReadsb(raw)`, `fromTar1090(raw)`, `fromSbs1(raw)`. Keep them
pure and unit-testable (mirror `seed-military-flights.mjs`'s exported-pure-
function pattern — `tests/seed-military-flights-adsb.test.mjs` is the model).

## Step 2 — Multi-feeder seeder

New `scripts/seed-collective-adsb.mjs`, modeled on `seed-local-adsb.mjs` but
fetching all 4 feeders in parallel (`Promise.allSettled`, one feeder's outage
must not blank the other 3 — this is the main behavioral difference from the
single-feeder seeder, which has no such fan-out to isolate).

**Dedup logic** (the actual hard part): two feeders in range of the same
aircraft will both report it. Key by ICAO `hex` (globally unique, unlike
callsign). When the same hex appears from 2+ feeders in one poll:
- Keep the reading with the lowest `seen`/most recent timestamp
- Tag the merged record with `seenBy: string[]` (which feeders had it) —
  this is useful signal on its own (a plane seen by feeders A+B confirms
  both antennas' coverage overlaps there, good for a coverage-diagnostic view)
- Prefer the higher-signal (`rssi`) reading when timestamps tie

Redis key: `adsb:collective:v1`, TTL ~150s (matches `adsb:local:v1`
precedent). Cron: every minute, dedicated line (same pattern as the existing
`* * * * *` local-adsb cron entry — NOT folded into the 30-min
`run-seeders.sh` bundle, which is for slow/batch seeders).

**Triple bootstrap registration** (do not skip a step — this bit us on the
ACARS panel too): `api/bootstrap.js` (`BOOTSTRAP_CACHE_KEYS` + `FAST_KEYS`),
`api/health.js` (`BOOTSTRAP_KEYS` + `ON_DEMAND_KEYS`),
`server/_shared/cache-keys.ts` (`BOOTSTRAP_CACHE_KEYS` + `BOOTSTRAP_TIERS`).

## Step 3 — Panel

New `src/components/CollectiveAdsbPanel.ts`, built on
`LocalAdsbPanel.ts`'s radar-canvas pattern but multi-center:
- Radar draws from a computed centroid (or a fixed map-projection view) with
  each feeder's coverage ring in a distinct color + a small legend
- Aircraft dot color could encode `seenBy.length` (2+ feeders = higher
  confidence dot, maybe a subtle glow) instead of altitude-band coloring —
  altitude bands only make sense per-feeder-range; with 4 feeders spread
  over a wider area a color-by-source-count scheme reads better. Decide
  this in-session once you see real coverage overlap (or lack of it) —
  don't guess it now.
- Feeder health strip: one row per feeder (name, msg/min, noise, signal,
  gain) below the radar, reusing the `statsRow` grid from `LocalAdsbPanel`
  but ×4 rows instead of one 4-column row.

Consider whether this REPLACES `local-adsb` panel/preset entry or lives
alongside it — probably replace, since single-feeder becomes redundant once
collective exists. If replacing: update `panels.ts`, `panel-layout.ts`,
`mission-presets.ts` (Aviation Ops preset), and decide whether to delete
`seed-local-adsb.mjs`/`LocalAdsbPanel.ts` or keep them dormant. Ask before
deleting — per the "fix it, don't replace it without asking" project rule.

## Open questions for next session (don't guess — ask)

1. Are the 4 feeders geographically spread (different cities/countries) or
   clustered (e.g. all Nairobi-area, overlapping coverage)? Determines
   whether "collective" means true multilateration-style overlap-dedup or
   just "4 independent panels rendered on one map."
2. Any of the 4 behind NAT/without a static LAN IP? (Affects whether direct
   polling works or a lightweight relay/mDNS lookup is needed.)
3. Keep single-feeder `local-adsb` panel as a fallback/detail view, or fully
   replace with collective?

Related: `[[adsb-feeder]]`, `[[aviation-phases]]`, `[[session-20260623]]`
