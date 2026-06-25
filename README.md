# World Monitor

**Real-time global intelligence dashboard** — AI-powered news aggregation, geopolitical monitoring, and infrastructure tracking in a unified situational awareness interface.

[![GitHub stars](https://img.shields.io/github/stars/koala73/worldmonitor?style=social)](https://github.com/koala73/worldmonitor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/koala73/worldmonitor?style=social)](https://github.com/koala73/worldmonitor/network/members)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.gg/re63kWKxaz)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Last commit](https://img.shields.io/github/last-commit/koala73/worldmonitor)](https://github.com/koala73/worldmonitor/commits/main)
[![Latest release](https://img.shields.io/github/v/release/koala73/worldmonitor?style=flat)](https://github.com/koala73/worldmonitor/releases/latest)

<p align="center">
  <a href="https://worldmonitor.app"><img src="https://img.shields.io/badge/Web_App-worldmonitor.app-blue?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Web App"></a>&nbsp;
  <a href="https://tech.worldmonitor.app"><img src="https://img.shields.io/badge/Tech_Variant-tech.worldmonitor.app-0891b2?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Tech Variant"></a>&nbsp;
  <a href="https://finance.worldmonitor.app"><img src="https://img.shields.io/badge/Finance_Variant-finance.worldmonitor.app-059669?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Finance Variant"></a>&nbsp;
  <a href="https://commodity.worldmonitor.app"><img src="https://img.shields.io/badge/Commodity_Variant-commodity.worldmonitor.app-b45309?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Commodity Variant"></a>&nbsp;
  <a href="https://happy.worldmonitor.app"><img src="https://img.shields.io/badge/Happy_Variant-happy.worldmonitor.app-f59e0b?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Happy Variant"></a>
</p>

<p align="center">
  <a href="https://worldmonitor.app/api/download?platform=windows-exe"><img src="https://img.shields.io/badge/Download-Windows_(.exe)-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows"></a>&nbsp;
  <a href="https://worldmonitor.app/api/download?platform=macos-arm64"><img src="https://img.shields.io/badge/Download-macOS_Apple_Silicon-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS ARM"></a>&nbsp;
  <a href="https://worldmonitor.app/api/download?platform=macos-x64"><img src="https://img.shields.io/badge/Download-macOS_Intel-555555?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS Intel"></a>&nbsp;
  <a href="https://worldmonitor.app/api/download?platform=linux-appimage"><img src="https://img.shields.io/badge/Download-Linux_(.AppImage)-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Download Linux"></a>
</p>

<p align="center">
  <a href="https://docs.worldmonitor.app"><strong>Documentation</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/koala73/worldmonitor/releases/latest"><strong>Releases</strong></a> &nbsp;·&nbsp;
  <a href="https://docs.worldmonitor.app/contributing"><strong>Contributing</strong></a>
</p>

![World Monitor Dashboard](docs/images/worldmonitor-7-mar-2026.jpg)

---

## What It Does

- **435+ curated news feeds** across 15 categories, AI-synthesized into briefs
- **Dual map engine** — 3D globe (globe.gl) and WebGL flat map (deck.gl) with 45 data layers
- **Cross-stream correlation** — military, economic, disaster, and escalation signal convergence
- **Country Intelligence Index** — composite risk scoring across 12 signal categories
- **Finance radar** — 92 stock exchanges, commodities, crypto, and 7-signal market composite
- **Local AI** — run everything with Ollama, no API keys required
- **5 site variants** from a single codebase (world, tech, finance, commodity, happy)
- **Native desktop app** (Tauri 2) for macOS, Windows, and Linux
- **21 languages** with native-language feeds and RTL support

For the full feature list, architecture, data sources, and algorithms, see the **[documentation](https://docs.worldmonitor.app)**.

---

## Quick Start

```bash
git clone https://github.com/koala73/worldmonitor.git
cd worldmonitor
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). No environment variables required for basic operation.

For variant-specific development:

```bash
npm run dev:tech       # tech.worldmonitor.app
npm run dev:finance    # finance.worldmonitor.app
npm run dev:commodity  # commodity.worldmonitor.app
npm run dev:happy      # happy.worldmonitor.app
```

The `.env.example` file documents every variable with descriptions and registration links, organized by deployment target (Vercel vs Railway). Key groups:

| Group             | Variables                                                                  | Free Tier                                  |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| **AI (Local)**    | `OLLAMA_API_URL`, `OLLAMA_MODEL`                                           | Free (runs on your hardware)               |
| **AI (Cloud)**    | `GROQ_API_KEY`, `OPENROUTER_API_KEY`                                       | 14,400 req/day (Groq), 50/day (OpenRouter) |
| **Cache**         | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                       | 10K commands/day                           |
| **Markets**       | `FINNHUB_API_KEY`, `FRED_API_KEY`, `EIA_API_KEY`                           | All free tier                              |
| **Tracking**      | `WINGBITS_API_KEY`, `AISSTREAM_API_KEY`                                    | Free                                       |
| **Geopolitical**  | `CLOUDFLARE_API_TOKEN`, `NASA_FIRMS_API_KEY`                               | NASA FIRMS free; Cloudflare paid           |
| **Conflict**      | `ACLED_DISABLED=true` (default), `UCDP_ACCESS_TOKEN`                       | ACLED paid; UCDP free fallback             |
| **Relay**         | `WS_RELAY_URL`, `VITE_WS_RELAY_URL`, `OPENSKY_CLIENT_ID/SECRET`            | Self-hosted                                |
| **UI**            | `VITE_VARIANT`, `VITE_MAP_INTERACTION_MODE` (`flat` or `3d`, default `3d`) | N/A                                        |
| **Observability** | `VITE_SENTRY_DSN`, `SENTRY_EDGE_DSN`, `SENTRY_DESKTOP_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | N/A                                        |

See [`.env.example`](./.env.example) for the complete list with registration links.

---

## Self-Hosting

World Monitor relies on **60+ Vercel Edge Functions** in the `api/` directory for RSS proxying, data caching, and API key isolation. Running `npm run dev` alone starts only the Vite frontend — the edge functions won't execute, and most panels (news feeds, markets, AI summaries) will be empty.

### Option 1: Deploy to Vercel (Recommended)

The simplest path — Vercel runs the edge functions natively on their free tier:

```bash
npm install -g vercel
vercel          # Follow prompts to link/create project
```

Add your API keys in the Vercel dashboard under **Settings → Environment Variables**, then visit your deployment URL. The free Hobby plan supports all 60+ edge functions.

### Option 2: Local Development with Vercel CLI

To run everything locally (frontend + edge functions):

```bash
npm install -g vercel
cp .env.example .env.local   # Add your API keys
vercel dev                   # Starts on http://localhost:3000
```

> **Important**: Use `vercel dev` instead of `npm run dev`. The Vercel CLI emulates the edge runtime locally so all `api/` endpoints work. Plain `npm run dev` only starts Vite and the API layer won't be available.

### Option 3: Static Frontend Only

If you only want the map and client-side features (no news feeds, no AI, no market data):

```bash
npm run dev    # Vite dev server on http://localhost:5173
```

This runs the frontend without the API layer. Panels that require server-side proxying will show "No data available". The interactive map, static data layers (bases, cables, pipelines), and browser-side ML models still work.

### Platform Notes

| Platform               | Status                  | Notes                                                                                                                          |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Vercel**             | Full support            | Recommended deployment target                                                                                                  |
| **Linux x86_64**       | Full support            | Works with `vercel dev` for local development. Desktop .AppImage available for x86_64. WebKitGTK rendering uses DMA-BUF with fallback to SHM for GPU compatibility. Font stack includes DejaVu Sans Mono and Liberation Mono for consistent rendering across distros |
| **macOS**              | Works with `vercel dev` | Full local development                                                                                                         |
| **Raspberry Pi / ARM** | Partial                 | `vercel dev` edge runtime emulation may not work on ARM. Use Option 1 (deploy to Vercel) or Option 3 (static frontend) instead |
| **Docker**             | Official image         | See [Docker image](#docker-image-official) ([#1260](https://github.com/koala73/worldmonitor/issues/1260))                    |

### Docker image (official)

An official Docker image is published to GitHub Container Registry on each [release](https://github.com/koala73/worldmonitor/releases) ([#1260](https://github.com/koala73/worldmonitor/issues/1260)):

- **Image**: `ghcr.io/koala73/worldmonitor`
- **Architectures**: `linux/amd64`, `linux/arm64`
- **Tags**: `latest`, `vX.Y.Z` (e.g. `v2.6.0`), and `X.Y` (e.g. `2.6`)

The image is **frontend-only**: it serves the Vite-built static app with nginx and proxies `/api/*` to an upstream API. No Node or edge functions run inside the container.

**Build (from repo root):**

```bash
docker build -f docker/Dockerfile -t ghcr.io/koala73/worldmonitor:latest .
```

**Run (default API: `https://api.worldmonitor.app`):**

```bash
docker run -d --name worldmonitor -p 3000:80 ghcr.io/koala73/worldmonitor:latest
```

Then open [http://localhost:3000](http://localhost:3000).

**Environment variables:**

| Variable        | Default                        | Description                                      |
| --------------- | ------------------------------ | ------------------------------------------------ |
| `API_UPSTREAM`  | `https://api.worldmonitor.app` | Backend URL for `/api/*` proxy (set at runtime)  |

The proxy forwards the upstream host (`Host: <API_UPSTREAM host>`) so the default API receives the correct Host. If your backend expects a different Host, configure it accordingly.

Example with a custom API backend:

```bash
docker run -d -p 3000:80 -e API_UPSTREAM=http://my-api:3001 ghcr.io/koala73/worldmonitor:latest
```

Build-time options (optional, for custom builds): pass `VITE_VARIANT` and `VITE_WS_API_URL` via `--build-arg`. Other `VITE_*` vars the app uses (e.g. `VITE_PMTILES_URL`, `VITE_WS_RELAY_URL`) can be added the same way; see `.env.example` for the full list.

### Railway Relay (Optional)

The Railway relay is a multi-protocol gateway that handles data sources requiring persistent connections, residential proxying, or upstream APIs that block Vercel's edge runtime:

```bash
# On Railway, deploy with:
node scripts/ais-relay.cjs
```

| Service                 | Protocol        | Purpose                                                              |
| ----------------------- | --------------- | -------------------------------------------------------------------- |
| **AIS Vessel Tracking** | WebSocket       | Live AIS maritime data with chokepoint detection and density grids   |
| **OpenSky Aircraft**    | REST (polling)  | Military flight tracking across merged query regions                 |
| **Telegram OSINT**      | MTProto (GramJS)| 26 OSINT channels polled on 60s cycle with FLOOD_WAIT handling       |
| **OREF Rocket Alerts**  | curl + proxy    | Israel Home Front Command sirens via residential proxy (Akamai WAF)  |
| **Polymarket Proxy**    | HTTPS           | JA3 fingerprint bypass with request queuing and cache deduplication   |
| **ICAO NOTAM**          | REST            | Airport/airspace closure detection for 46 MENA airports              |

Set `WS_RELAY_URL` (server-side, HTTPS) and `VITE_WS_RELAY_URL` (client-side, WSS) in your environment. Without the relay, AIS, OpenSky, Telegram, and OREF layers won't show live data, but all other features work normally.

### Self-Hosted Local Cache

For a single-user or small self-hosted deployment, the server cache layer can run without Upstash.

Set:

```bash
WM_CACHE_BACKEND=local-file
WM_LOCAL_CACHE_FILE=/absolute/path/to/worldmonitor-cache.json
```

This switches [server/_shared/redis.ts](server/_shared/redis.ts) to a local file-backed cache store instead of Upstash. It keeps the existing server cache API (`getCachedJson`, `setCachedJson`, batch reads, sorted-set history storage) so most handlers continue to work unchanged.

What this does:

- Replaces shared Upstash cache reads/writes with a local JSON store on disk
- Lets the shared seed utilities and migrated seed writers publish canonical keys into the same local cache store
- Preserves browser-side `IndexedDB` / `localStorage` behavior unchanged
- Works well for single-user or small self-hosted installs

What this does not do yet:

- It does not replace the optional relay process for AIS/OpenSky/Telegram/OREF

For a minimal self-hosted setup, use static hosting for the SPA, keep browser persistence as-is, and point the server runtime at `WM_CACHE_BACKEND=local-file`.

Recommended startup flow:

```bash
npm run selfhost:start
```

This wrapper runs a lightweight self-host preparation step before starting the local API. In local-file mode it checks whether the webcam seed keys exist in `WM_LOCAL_CACHE_FILE`; if they are missing and `WINDY_API_KEY` is configured, it runs `scripts/seed-webcams.mjs` automatically so the webcam map layer does not start empty.

You can also run the preparation step by itself:

```bash
npm run selfhost:prepare
```

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | Vanilla TypeScript, Vite, globe.gl + Three.js, deck.gl + MapLibre GL |
| **Desktop** | Tauri 2 (Rust) with Node.js sidecar |
| **AI/ML** | Ollama / Groq / OpenRouter, Transformers.js (browser-side) |
| **API Contracts** | Protocol Buffers (92 protos, 22 services), sebuf HTTP annotations |
| **Deployment** | Vercel Edge Functions (60+), Railway relay, Tauri, PWA |
| **Caching** | Redis (Upstash), 3-tier cache, CDN, service worker |

Full stack details in the **[architecture docs](https://docs.worldmonitor.app/architecture)**.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

```bash
npm run typecheck        # Type checking
npm run build:full       # Production build
```

---

## License

**AGPL-3.0** for non-commercial use. **Commercial license** required for any commercial use.

| Use Case | Allowed? |
|----------|----------|
| Personal / research / educational | Yes |
| Self-hosted (non-commercial) | Yes, with attribution |
| Fork and modify (non-commercial) | Yes, share source under AGPL-3.0 |
| Commercial use / SaaS / rebranding | Requires commercial license |

See [LICENSE](LICENSE) for full terms. For commercial licensing, contact the maintainer.

Copyright (C) 2024-2026 Elie Habib. All rights reserved.

---

## Author

**Elie Habib** — [GitHub](https://github.com/koala73)

## Contributors

<a href="https://github.com/koala73/worldmonitor/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=koala73/worldmonitor" />
</a>

## Security Acknowledgments

We thank the following researchers for responsibly disclosing security issues:

- **Cody Richard** — Disclosed three security findings covering IPC command exposure, renderer-to-sidecar trust boundary analysis, and fetch patch credential injection architecture (2026)

See our [Security Policy](./SECURITY.md) for responsible disclosure guidelines.

---

<p align="center">
  <a href="https://worldmonitor.app">worldmonitor.app</a> &nbsp;·&nbsp;
  <a href="https://docs.worldmonitor.app">docs.worldmonitor.app</a> &nbsp;·&nbsp;
  <a href="https://finance.worldmonitor.app">finance.worldmonitor.app</a> &nbsp;·&nbsp;
  <a href="https://commodity.worldmonitor.app">commodity.worldmonitor.app</a>
</p>

## Star History

<a href="https://api.star-history.com/svg?repos=koala73/worldmonitor&type=Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=koala73/worldmonitor&type=Date&type=Date&theme=dark" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=koala73/worldmonitor&type=Date&type=Date" />
 </picture>
</a>
