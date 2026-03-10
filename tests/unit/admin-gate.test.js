import { describe, it, expect } from 'vitest';
import { computeForwardKeyPayloads } from '../../web/admin-gate.js';

describe('admin gating / forwarding', () => {
  it('computes payloads only for allowed viewers', () => {
    const viewers = new Map([
      ['pubA', { allowed: true }],
      ['pubB', { allowed: false }],
      ['pubC', { allowed: true }],
    ]);

    const payloads = computeForwardKeyPayloads(viewers, {
      streamId: 'demo1',
      frameId: 12,
      blobHash: 'hash',
      keyB64: 'k==',
      mime: 'video/webm',
      codec: 'video/webm;codecs=vp8,opus',
      alg: 'aes-gcm',
      v: 1,
    });

    expect(payloads.map((p) => p.viewerPub).sort()).toEqual(['pubA', 'pubC']);
    const msg = JSON.parse(payloads[0].payload);
    expect(msg.streamId).toBe('demo1');
    expect(msg.frameId).toBe(12);
    expect(msg.x).toBe('hash');
    expect(msg.k).toBe('k==');
    expect(msg.m).toBe('video/webm');
    expect(msg.alg).toBe('aes-gcm');
    expect(msg.v).toBe(1);
  });
});
