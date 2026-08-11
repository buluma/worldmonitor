import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeMessage } from '../scripts/seed-acars.mjs';

describe('ACARS message normalization', () => {
  it('normalizes a raw VDL-M2 message from acars_msg_batch', () => {
    const raw = {
      timestamp: 1786466092,
      station_id: 'SW-HKNW-VDLM2',
      icao_hex: '89633A',
      tail: 'A6-EIP',
      flight: 'EY03DL',
      label: '3U',
      label_type: 'Uplink Acknowledgement',
      text: 'WXR01-SA,ETD3DL,HKJK,OMAA,11AUG26',
      freq: 136.975,
      level: -12,
      is_onground: 0,
      uid: '1287914',
      message_type: 'VDL-M2',
      matched: false,
      matched_text: [],
    };

    const msg = normalizeMessage(raw);
    assert.equal(msg.uid, '1287914');
    assert.equal(msg.timestamp, 1786466092 * 1000); // acarshub sends epoch seconds
    assert.equal(msg.messageType, 'VDL-M2');
    assert.equal(msg.flight, 'EY03DL');
    assert.equal(msg.tail, 'A6-EIP');
    assert.equal(msg.labelType, 'Uplink Acknowledgement');
    assert.equal(msg.isOnground, false);
    assert.equal(msg.libacars, null);
  });

  it('parses the libacars JSON string into an object', () => {
    const raw = {
      uid: '1287814',
      timestamp: 1786463931,
      message_type: 'VDL-M2',
      libacars: '{"msg_type":"adsc_msg","crc_ok":true}',
    };

    const msg = normalizeMessage(raw);
    assert.deepEqual(msg.libacars, { msg_type: 'adsc_msg', crc_ok: true });
  });

  it('falls back to null libacars on malformed JSON instead of throwing', () => {
    const raw = { uid: '1', timestamp: 1, libacars: '{not json' };
    const msg = normalizeMessage(raw);
    assert.equal(msg.libacars, null);
  });

  it('returns null for a message with no uid — acarshub payloads without one cannot be deduped', () => {
    assert.equal(normalizeMessage({ timestamp: 1, text: 'hello' }), null);
  });

  it('returns null for non-object input', () => {
    assert.equal(normalizeMessage(null), null);
    assert.equal(normalizeMessage(undefined), null);
  });

  it('is_onground:1 maps to true, any other value maps to false', () => {
    assert.equal(normalizeMessage({ uid: '1', is_onground: 1 }).isOnground, true);
    assert.equal(normalizeMessage({ uid: '2', is_onground: 2 }).isOnground, false);
    assert.equal(normalizeMessage({ uid: '3' }).isOnground, false);
  });
});
