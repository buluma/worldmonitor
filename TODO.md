# World Monitor — Improvement Backlog

Sourced from worldmonitor_og divergence analysis + heimdal deployment observations.

## Performance (manual reimplementation needed — OG cherry-picks conflict)

- [ ] Defer secondary startup payloads — analytics/non-critical JS off critical path
- [ ] Fix first-load CLS — stabilize layout shift on dashboard load
- [ ] Gate live media on user intent — YouTube/streams don't auto-load until clicked (big win on Pi/mobile)
- [ ] Defer heavy renderer startup — globe/deck.gl init deferred for faster TTI

## Features (free, no paid gates)

- [ ] Threat timeline panel — chronological threat event visualization
- [ ] Embeddable live map — shareable/embeddable map widget for external use
- [ ] Panel data freshness badges — show how stale each panel's data is
- [ ] Dashboard tabs — save/switch between panel workspace layouts
- [ ] Mobile category navigation chips + breaking/critical banner parity
- [ ] Mission presets — preconfigured dashboard layouts for new users (onboarding)
- [ ] AI brief source attribution — show what LLM briefs cite
- [ ] Default fresh sessions to globe view — better first impression
- [ ] Layer tooltips — explain what high-adoption map layers show

## Bug Fixes (from OG, not yet ported)

- [ ] Gate relay boot seeds on freshness — prevent reboot-storm abuse
- [ ] Unwrap seed/data envelope in regime engine — stops reporting flat "calm"
- [ ] Scoped internal auth for relay warm-pings — proper fix for 401s (we patched around it)
- [ ] Don't clobber good token-panels with empty writes on partial fetch failure

## Self-Host / heimdal

- [ ] Add `ACLED_EMAIL`/`ACLED_PASSWORD` scope param (`scope=authenticated`) to OAuth helper — see "ACLED → GDELT Migration" section
- [ ] Investigate ACLED API access — account may need researcher approval — see "ACLED → GDELT Migration" section
- [ ] Obtain `military-bases-final.json` dataset (or `CLOUDFLARE_R2_ACCOUNT_ID`) for military bases layer
- [ ] Set up log rotation for `/tmp/wm-seeders.log`
- [ ] Add `WINDY_API_KEY` for webcam layer (optional)
- [ ] Add `UCDP_ACCESS_TOKEN` for higher rate limits on conflict data (optional)
- [ ] Investigate FIRMS seeder Node fetch failures — curl works, Node doesn't (transient?)
- [ ] Consider adding seeder cron to `docker-compose.override.yml` as a sidecar instead of host cron

## ACLED → GDELT Migration (or key renewal)

ACLED API returning 403 — expired key/account. Health endpoint reports 503 (DEGRADED) because
`risk:scores:sebuf:v1` and `risk:scores:sebuf:stale:v1` are empty or stale, pushing `critCount > 0`.
Three options ranked by effort:

### Option A: Renew ACLED key (lowest effort, best data quality)
- [ ] Apply at acleddata.com/register — takes ~5 min, approval usually instant
- [ ] Set `ACLED_EMAIL` + `ACLED_PASSWORD` in Heimdal `.env`
- [ ] Restart worldmonitor container — OAuth auto-exchange handles the rest

### Option B: Replace ACLED with GDELT (medium effort, data quality tradeoff)

**What changes:**

1. `server/_shared/gdelt.ts` — New shared fetcher for GDELT GEO API v2
   - No auth needed, no rate limits
   - Returns GeoJSON: `{ features: [{ properties: { name, count, url, shareimage }, geometry: { coordinates } }] }`
   - Cache in Redis same pattern as `acled.ts` (15 min TTL)

2. `server/_shared/acled.ts` → update `fetchAcledCached` to call GDELT or add adapter
   - Keep `AcledRawEvent` interface as internal canonical type
   - Map GDELT fields → `AcledRawEvent` shape so downstream consumers don't change
   - **Lost fields:** `fatalities` (GDELT has none), `actor1/2`, `sub_event_type`, `event_id_cnty`
   - **Gained:** news volume/count per event cluster

3. `server/worldmonitor/intelligence/v1/get-risk-scores.ts` — Biggest impact
   - `fetchACLEDEvents()` returns per-event fatalities — core to CII scoring
   - Without fatalities: `conflictFatalities`, `protestFatalities` always 0
   - Scoring components `fatalityScore`, `unrestFatalityBoost`, `civilianBoost` become inert
   - **Fix:** Use GDELT `count` (article volume) as proxy signal, recalibrate weights
   - **Alt:** Lean harder on UCDP (already integrated) for fatality data

4. `server/worldmonitor/conflict/v1/list-acled-events.ts` — Moderate impact
   - Maps to `AcledConflictEvent` with `fatalities`, `actors[]`, `source`
   - GDELT can provide `lat/lon`, `country`, `eventType` but not individual fatalities or actors
   - Conflict map markers would lose detail tooltips

5. `server/worldmonitor/unrest/v1/list-unrest-events.ts` — No change needed
   - Already reads from Redis seed cache (`unrest:events:v1`)
   - Seed script (Railway) is separate — update that independently

6. `server/_shared/acled-auth.ts` — Can be deleted or kept dormant

7. `api/health.js` — No change needed
   - Health checks Redis keys, not ACLED directly
   - Once risk scores populate via GDELT, health returns 200

8. `src/services/country-instability.ts` — Frontend, ~1000 lines
   - References ACLED event types in scoring
   - If backend adapter maps GDELT → `AcledRawEvent`, frontend untouched

**Files touched:** 3-4 server files + 1 new file
**Risk:** Scoring accuracy degrades (no fatality data). Calibration needed.
**Timeline:** ~4-6 hours implementation + testing

### Option C: Expand UCDP role + disable ACLED gracefully (smallest useful change)
- [x] UCDP already provides conflict events with fatalities and intensity levels
- [x] Risk scores already have UCDP floor logic (`ucdpWar`, `ucdpMinor`)
- [x] Expand UCDP ingestion in `computeCIIScores()` — fatalities, violence type mapping, time-decay
- [x] Set ACLED fetcher to return `[]` immediately via `ACLED_DISABLED=true` env var
- [x] Scores fall back to `BASELINE_RISK` + UCDP + other aux sources — still useful
- [ ] Health recovers once `risk:scores:sebuf:v1` populates from non-ACLED sources (set `ACLED_DISABLED=true` on heimdal)

**Files touched:** 2 files (`get-risk-scores.ts`, `acled.ts`)
**Risk:** Less granular than ACLED (UCDP updates monthly, not daily)
**Timeline:** ~1-2 hours

---

## Country Resilience Index (CRI)

Large module (~50 commits in OG). Full country resilience scoring: governance, energy, trade, social indicators. All data sources appear free (WGI, WTO, energy APIs). Worth porting as a batch project.

## Alerting Pipeline

Rule-based alerting from World Monitor signals → Telegram.

- [x] Rule engine in ais-relay.cjs — evaluate conditions after each seed cycle
- [x] Earthquake alerts: M6+ quakes, volcanic eruptions, tsunami warnings
- [ ] Geopolitical alerts: CII risk score spikes >20%, GDELT escalation (delta rules — baseline snapshots needed)
- [x] Market alerts: major moves >5%, commodity spikes, crypto crashes
- [x] Natural event alerts: severe weather, wildfires near populated areas
- [x] Alert state in Redis — prevent duplicate notifications (cooldown per event)
- [x] Configurable thresholds (env vars or Redis config key)
- [x] Deliver via Telegram Bot API (ALERT_TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID)
- [x] New conflict event alerts (UCDP delta detection)

## Infrastructure

- [x] Set up Uptime Kuma check for `wm.opsio.space` health endpoint
- [ ] Add Prometheus scrape target for worldmonitor container metrics
- [ ] Selective cherry-pick from OG (avoid rebase — paid gates would reintroduce)
