import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const runtime = await import('../src/services/runtime.ts');
const { isWorldMonitorWebHost, detectDesktopRuntime } = runtime;

describe('isWorldMonitorWebHost (self-host routing guard)', () => {
  it('matches worldmonitor.app', () => {
    assert.equal(isWorldMonitorWebHost('worldmonitor.app'), true);
  });

  it('matches www.worldmonitor.app', () => {
    assert.equal(isWorldMonitorWebHost('www.worldmonitor.app'), true);
  });

  it('matches subdomains of worldmonitor.app', () => {
    assert.equal(isWorldMonitorWebHost('api.worldmonitor.app'), true);
    assert.equal(isWorldMonitorWebHost('tech.worldmonitor.app'), true);
  });

  it('does NOT match wm.opsio.space (self-host)', () => {
    assert.equal(isWorldMonitorWebHost('wm.opsio.space'), false,
      'wm.opsio.space must not match — this caused all self-host API traffic to route to cloud');
  });

  it('does NOT match subdomains of wm.opsio.space', () => {
    assert.equal(isWorldMonitorWebHost('tech.wm.opsio.space'), false);
  });

  it('does NOT match localhost', () => {
    assert.equal(isWorldMonitorWebHost('localhost'), false);
  });

  it('does NOT match 127.0.0.1', () => {
    assert.equal(isWorldMonitorWebHost('127.0.0.1'), false);
  });

  it('does NOT match arbitrary custom domains', () => {
    assert.equal(isWorldMonitorWebHost('monitor.example.com'), false);
    assert.equal(isWorldMonitorWebHost('my-worldmonitor.app'), false);
  });
});

describe('detectDesktopRuntime', () => {
  const webProbe = {
    hasTauriGlobals: false,
    userAgent: 'Mozilla/5.0',
    locationProtocol: 'https:',
    locationHost: 'wm.opsio.space',
    locationOrigin: 'https://wm.opsio.space',
  };

  it('returns false for a regular web browser', () => {
    assert.equal(detectDesktopRuntime(webProbe), false);
  });

  it('returns true when Tauri globals are present', () => {
    assert.equal(detectDesktopRuntime({ ...webProbe, hasTauriGlobals: true }), true);
  });

  it('returns true for Tauri user agent', () => {
    assert.equal(detectDesktopRuntime({ ...webProbe, userAgent: 'Tauri/2.0' }), true);
  });

  it('returns true for tauri:// protocol', () => {
    assert.equal(detectDesktopRuntime({
      ...webProbe,
      locationProtocol: 'tauri:',
      locationHost: 'tauri.localhost',
      locationOrigin: 'tauri://localhost',
    }), true);
  });

  it('returns true for secure localhost (desktop dev server)', () => {
    assert.equal(detectDesktopRuntime({
      ...webProbe,
      locationProtocol: 'https:',
      locationHost: 'localhost:1420',
    }), true);
  });
});
