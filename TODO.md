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

- [x] ~~ACLED disabled — API requires paid license, UCDP fallback active~~
- [ ] Obtain `military-bases-final.json` dataset (or `CLOUDFLARE_R2_ACCOUNT_ID`) for military bases layer
- [ ] Set up log rotation for `/tmp/wm-seeders.log`
- [ ] Add `WINDY_API_KEY` for webcam layer (optional)
- [ ] Add `UCDP_ACCESS_TOKEN` for higher rate limits on conflict data (optional)
- [ ] Investigate FIRMS seeder Node fetch failures — curl works, Node doesn't (transient?)
- [ ] Consider adding seeder cron to `docker-compose.override.yml` as a sidecar instead of host cron

## ACLED — Permanently Disabled (2025-06-25)

ACLED API requires paid data license. Free/Open accounts have no API access.
Option C (UCDP fallback) implemented and shipped. ACLED code remains but is gated
behind `ACLED_DISABLED=true` (now default). If a paid license is ever obtained,
set `ACLED_DISABLED=` (empty) and configure credentials.

- [x] UCDP expanded to fill ACLED gap (fatalities, violence type mapping, time-decay)
- [x] `ACLED_DISABLED=true` env var gates all ACLED API calls
- [x] Default set to `true` in `.env.example`, `docker-compose.yml`, heimdal `.env`
- [x] Docs updated (README, SELF_HOSTING, ARCHITECTURE)

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
