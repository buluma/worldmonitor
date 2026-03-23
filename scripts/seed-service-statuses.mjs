#!/usr/bin/env node

/**
 * Seeds service status data.
 *
 * - Cloud/Upstash mode: warm-pings the RPC endpoint so the hosted handler owns
 *   fetch + cache semantics.
 * - Self-hosted local-file mode: fetches provider status pages directly and
 *   publishes the canonical cache key without relying on remote side effects.
 */

import {
  loadEnvFile,
  CHROME_UA,
  getSeedCacheBackend,
  logSeedResult,
  extendExistingTtl,
  redisGet,
  getRedisCredentials,
  atomicPublish,
  writeFreshnessMetadata,
} from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const RPC_URL = `${process.env.WM_API_BASE_URL || 'https://api.worldmonitor.app'}/api/infrastructure/v1/list-service-statuses`;
const CANONICAL_KEY = 'infra:service-statuses:v1';
const META_KEY = 'seed-meta:infra:service-statuses';
const CACHE_TTL_SECONDS = 1800;
const META_SOURCE = 'seed-service-statuses';
const UPSTREAM_TIMEOUT_MS = 20_000;

const SERVICES = [
  { id: 'aws', name: 'AWS', statusPage: 'https://health.aws.amazon.com/health/status', customParser: 'aws' },
  { id: 'azure', name: 'Azure', statusPage: 'https://azure.status.microsoft/en-us/status/feed/', customParser: 'rss' },
  { id: 'gcp', name: 'Google Cloud', statusPage: 'https://status.cloud.google.com/incidents.json', customParser: 'gcp' },
  { id: 'cloudflare', name: 'Cloudflare', statusPage: 'https://www.cloudflarestatus.com/api/v2/status.json' },
  { id: 'vercel', name: 'Vercel', statusPage: 'https://www.vercel-status.com/api/v2/status.json' },
  { id: 'netlify', name: 'Netlify', statusPage: 'https://www.netlifystatus.com/api/v2/status.json' },
  { id: 'digitalocean', name: 'DigitalOcean', statusPage: 'https://status.digitalocean.com/api/v2/status.json' },
  { id: 'render', name: 'Render', statusPage: 'https://status.render.com/api/v2/status.json' },
  { id: 'railway', name: 'Railway', statusPage: 'https://railway.instatus.com/summary.json', customParser: 'instatus' },
  { id: 'github', name: 'GitHub', statusPage: 'https://www.githubstatus.com/api/v2/status.json' },
  { id: 'gitlab', name: 'GitLab', statusPage: 'https://status.gitlab.com/1.0/status/5b36dc6502d06804c08349f7', customParser: 'statusio' },
  { id: 'npm', name: 'npm', statusPage: 'https://status.npmjs.org/api/v2/status.json' },
  { id: 'docker', name: 'Docker Hub', statusPage: 'https://www.dockerstatus.com/1.0/status/533c6539221ae15e3f000031', customParser: 'statusio' },
  { id: 'bitbucket', name: 'Bitbucket', statusPage: 'https://bitbucket.status.atlassian.com/api/v2/status.json' },
  { id: 'circleci', name: 'CircleCI', statusPage: 'https://status.circleci.com/api/v2/status.json' },
  { id: 'jira', name: 'Jira', statusPage: 'https://jira-software.status.atlassian.com/api/v2/status.json' },
  { id: 'confluence', name: 'Confluence', statusPage: 'https://confluence.status.atlassian.com/api/v2/status.json' },
  { id: 'linear', name: 'Linear', statusPage: 'https://linearstatus.com/api/v2/status.json', customParser: 'incidentio' },
  { id: 'slack', name: 'Slack', statusPage: 'https://slack-status.com/api/v2.0.0/current', customParser: 'slack' },
  { id: 'discord', name: 'Discord', statusPage: 'https://discordstatus.com/api/v2/status.json' },
  { id: 'zoom', name: 'Zoom', statusPage: 'https://www.zoomstatus.com/api/v2/status.json' },
  { id: 'notion', name: 'Notion', statusPage: 'https://www.notion-status.com/api/v2/status.json' },
  { id: 'openai', name: 'OpenAI', statusPage: 'https://status.openai.com/api/v2/status.json', customParser: 'incidentio' },
  { id: 'anthropic', name: 'Anthropic', statusPage: 'https://status.claude.com/api/v2/status.json', customParser: 'incidentio' },
  { id: 'replicate', name: 'Replicate', statusPage: 'https://www.replicatestatus.com/api/v2/status.json', customParser: 'incidentio' },
  { id: 'stripe', name: 'Stripe', statusPage: 'https://status.stripe.com/current', customParser: 'stripe' },
  { id: 'twilio', name: 'Twilio', statusPage: 'https://status.twilio.com/api/v2/status.json' },
  { id: 'datadog', name: 'Datadog', statusPage: 'https://status.datadoghq.com/api/v2/status.json' },
  { id: 'sentry', name: 'Sentry', statusPage: 'https://status.sentry.io/api/v2/status.json' },
  { id: 'supabase', name: 'Supabase', statusPage: 'https://status.supabase.com/api/v2/status.json' },
];

function normalizeToProtoStatus(raw) {
  if (!raw) return 'SERVICE_OPERATIONAL_STATUS_UNSPECIFIED';
  const val = String(raw).toLowerCase();
  if (val === 'none' || val === 'operational' || val.includes('all systems operational')) {
    return 'SERVICE_OPERATIONAL_STATUS_OPERATIONAL';
  }
  if (val === 'minor' || val === 'degraded_performance' || val.includes('degraded')) {
    return 'SERVICE_OPERATIONAL_STATUS_DEGRADED';
  }
  if (val === 'partial_outage') return 'SERVICE_OPERATIONAL_STATUS_PARTIAL_OUTAGE';
  if (val === 'major' || val.includes('partial system outage')) return 'SERVICE_OPERATIONAL_STATUS_PARTIAL_OUTAGE';
  if (val === 'major_outage' || val === 'critical') return 'SERVICE_OPERATIONAL_STATUS_MAJOR_OUTAGE';
  if (val === 'maintenance' || val.includes('maintenance')) return 'SERVICE_OPERATIONAL_STATUS_MAINTENANCE';
  return 'SERVICE_OPERATIONAL_STATUS_UNSPECIFIED';
}

async function checkServiceStatus(service) {
  const now = Date.now();
  const base = {
    id: service.id,
    name: service.name,
    url: service.statusPage,
  };
  const withStatus = (status, description, latencyMs = 0) => ({
    ...base,
    status,
    description,
    checkedAt: now,
    latencyMs,
  });
  const unknown = (desc) => withStatus('SERVICE_OPERATIONAL_STATUS_UNSPECIFIED', desc);

  try {
    const headers = {
      Accept: service.customParser === 'rss' ? 'application/xml, text/xml' : 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    };
    if (service.customParser !== 'incidentio') headers['User-Agent'] = CHROME_UA;

    const start = Date.now();
    const response = await fetch(service.statusPage, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) return withStatus('SERVICE_OPERATIONAL_STATUS_UNSPECIFIED', `HTTP ${response.status}`, latencyMs);

    if (service.customParser === 'gcp') {
      const data = await response.json();
      const active = Array.isArray(data) ? data.filter((item) => item.end === undefined || new Date(item.end) > new Date()) : [];
      if (active.length === 0) return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', 'All services operational', latencyMs);
      const hasHigh = active.some((item) => item.severity === 'high');
      return withStatus(hasHigh ? 'SERVICE_OPERATIONAL_STATUS_MAJOR_OUTAGE' : 'SERVICE_OPERATIONAL_STATUS_DEGRADED', `${active.length} active incident(s)`, latencyMs);
    }

    if (service.customParser === 'aws') {
      return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', 'Status page reachable', latencyMs);
    }

    if (service.customParser === 'rss') {
      const text = await response.text();
      const hasIncident = text.includes('<item>') && (text.includes('degradation') || text.includes('outage') || text.includes('incident'));
      return withStatus(
        hasIncident ? 'SERVICE_OPERATIONAL_STATUS_DEGRADED' : 'SERVICE_OPERATIONAL_STATUS_OPERATIONAL',
        hasIncident ? 'Recent incidents reported' : 'No recent incidents',
        latencyMs,
      );
    }

    if (service.customParser === 'instatus') {
      const data = await response.json();
      const pageStatus = data.page?.status;
      if (pageStatus === 'UP') return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', 'All systems operational', latencyMs);
      if (pageStatus === 'HASISSUES') return withStatus('SERVICE_OPERATIONAL_STATUS_DEGRADED', 'Some issues reported', latencyMs);
      return unknown(pageStatus || 'Unknown');
    }

    if (service.customParser === 'statusio') {
      const data = await response.json();
      const overall = data.result?.status_overall;
      const code = overall?.status_code;
      if (code === 100) return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', overall.status || 'All systems operational', latencyMs);
      if (code >= 300 && code < 500) return withStatus('SERVICE_OPERATIONAL_STATUS_DEGRADED', overall.status || 'Degraded performance', latencyMs);
      if (code >= 500) return withStatus('SERVICE_OPERATIONAL_STATUS_MAJOR_OUTAGE', overall.status || 'Service disruption', latencyMs);
      return unknown(overall?.status || 'Unknown status');
    }

    if (service.customParser === 'slack') {
      const data = await response.json();
      if (data.status === 'ok') return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', 'All systems operational', latencyMs);
      if (data.status === 'active' || data.active_incidents?.length > 0) {
        const count = data.active_incidents?.length || 1;
        return withStatus('SERVICE_OPERATIONAL_STATUS_DEGRADED', `${count} active incident(s)`, latencyMs);
      }
      return unknown(data.status || 'Unknown');
    }

    if (service.customParser === 'stripe') {
      const data = await response.json();
      if (data.largestatus === 'up') return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', data.message || 'All systems operational', latencyMs);
      if (data.largestatus === 'degraded') return withStatus('SERVICE_OPERATIONAL_STATUS_DEGRADED', data.message || 'Degraded performance', latencyMs);
      if (data.largestatus === 'down') return withStatus('SERVICE_OPERATIONAL_STATUS_MAJOR_OUTAGE', data.message || 'Service disruption', latencyMs);
      return unknown(data.message || 'Unknown');
    }

    if (service.customParser === 'incidentio') {
      const text = await response.text();
      if (text.startsWith('<!') || text.startsWith('<html')) {
        if (/All Systems Operational|fully operational|no issues/i.test(text)) {
          return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', 'All systems operational', latencyMs);
        }
        if (/degraded|partial outage|experiencing issues/i.test(text)) {
          return withStatus('SERVICE_OPERATIONAL_STATUS_DEGRADED', 'Some issues reported', latencyMs);
        }
        return unknown('Could not parse status');
      }
      try {
        const data = JSON.parse(text);
        const indicator = data.status?.indicator || '';
        const description = data.status?.description || '';
        if (indicator === 'none' || description.toLowerCase().includes('operational')) {
          return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', description || 'All systems operational', latencyMs);
        }
        if (indicator === 'minor' || indicator === 'maintenance') {
          return withStatus('SERVICE_OPERATIONAL_STATUS_DEGRADED', description || 'Minor issues', latencyMs);
        }
        if (indicator === 'major' || indicator === 'critical') {
          return withStatus('SERVICE_OPERATIONAL_STATUS_MAJOR_OUTAGE', description || 'Major outage', latencyMs);
        }
        return withStatus('SERVICE_OPERATIONAL_STATUS_OPERATIONAL', description || 'Status OK', latencyMs);
      } catch {
        return unknown('Invalid response');
      }
    }

    const text = await response.text();
    if (text.startsWith('<!') || text.startsWith('<html')) return unknown('Blocked by service');

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return unknown('Invalid JSON response');
    }

    if (data.status?.indicator !== undefined) {
      return withStatus(normalizeToProtoStatus(data.status.indicator), data.status.description || '', latencyMs);
    }
    if (data.status?.status) {
      return withStatus(data.status.status === 'ok' ? 'SERVICE_OPERATIONAL_STATUS_OPERATIONAL' : 'SERVICE_OPERATIONAL_STATUS_DEGRADED', data.status.description || '', latencyMs);
    }
    if (data.page && data.status) {
      return withStatus(normalizeToProtoStatus(data.status.indicator || data.status.description), data.status.description || 'Status available', latencyMs);
    }

    return unknown('Unknown format');
  } catch {
    return unknown('Request failed');
  }
}

async function warmPingHostedRpc() {
  const startMs = Date.now();
  console.log('=== infra:service-statuses Warm Ping ===');
  console.log(`  Key:     ${CANONICAL_KEY}`);
  console.log(`  Target:  ${RPC_URL}`);

  let data;
  try {
    const resp = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': CHROME_UA,
        Origin: 'https://worldmonitor.app',
      },
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) throw new Error(`RPC failed: HTTP ${resp.status}`);
    data = await resp.json();
  } catch (err) {
    console.error(`  FETCH FAILED: ${err.message || err}`);
    await extendExistingTtl([CANONICAL_KEY, META_KEY], 7200);
    console.log(`\n=== Failed gracefully (${Math.round(Date.now() - startMs)}ms) ===`);
    process.exit(0);
  }

  const count = data?.statuses?.length || 0;
  console.log(`  Statuses: ${count}`);

  const { url, token } = getRedisCredentials();
  const verifyData = await redisGet(url, token, CANONICAL_KEY);
  if (!verifyData) {
    throw new Error('Verification failed: cache key empty after successful RPC');
  }

  const durationMs = Date.now() - startMs;
  logSeedResult('infra', count, durationMs, { mode: 'warm-ping' });
  console.log(`\n=== Done (${Math.round(durationMs)}ms) ===`);
}

async function seedDirectToCache() {
  const startMs = Date.now();
  console.log('=== infra:service-statuses Direct Seed ===');
  console.log(`  Key:     ${CANONICAL_KEY}`);
  console.log(`  Mode:    local-file`);

  try {
    const statuses = await Promise.all(SERVICES.map(checkServiceStatus));
    const publishResult = await atomicPublish(CANONICAL_KEY, statuses, (value) => Array.isArray(value) && value.length > 0, CACHE_TTL_SECONDS);
    if (publishResult?.skipped) {
      throw new Error('Publish skipped: no statuses collected');
    }
    await writeFreshnessMetadata('infra', 'service-statuses', statuses.length, META_SOURCE);

    const { url, token } = getRedisCredentials();
    const verifyData = await redisGet(url, token, CANONICAL_KEY);
    if (!Array.isArray(verifyData) || verifyData.length === 0) {
      throw new Error('Verification failed: local cache key empty after publish');
    }

    const durationMs = Date.now() - startMs;
    console.log(`  Statuses: ${statuses.length}`);
    logSeedResult('infra', statuses.length, durationMs, { mode: 'direct', payloadBytes: publishResult?.payloadBytes || 0 });
    console.log(`\n=== Done (${Math.round(durationMs)}ms) ===`);
  } catch (err) {
    console.error(`  DIRECT SEED FAILED: ${err.message || err}`);
    await extendExistingTtl([CANONICAL_KEY, META_KEY], 7200);
    console.log(`\n=== Failed gracefully (${Math.round(Date.now() - startMs)}ms) ===`);
    process.exit(0);
  }
}

async function main() {
  if (getSeedCacheBackend() === 'local-file') {
    await seedDirectToCache();
    return;
  }
  await warmPingHostedRpc();
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(`ERROR: ${err.message || err}`);
  process.exit(1);
});
