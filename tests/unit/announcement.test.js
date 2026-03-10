import { describe, it, expect } from 'vitest';
import { parseVideoChunkAnnouncement, parseImageFrameAnnouncement } from '../../web/announcement.js';

describe('announcement parsing', () => {
  it('parses video chunk announcement', () => {
    const ev = {
      kind: 1,
      tags: [
        ['t', 'ignored'],
        ['d', 'demo1'],
        ['i', '7'],
        ['x', 'abc123'],
        ['m', 'video/webm'],
        ['c', 'video/webm;codecs=vp8,opus'],
      ],
    };
    const r = parseVideoChunkAnnouncement(ev, 'demo1');
    expect(r.ok).toBe(true);
    expect(r.chunkId).toBe(7);
    expect(r.blobHash).toBe('abc123');
    expect(r.mime).toBe('video/webm');
  });

  it('rejects wrong stream', () => {
    const ev = { kind: 1, tags: [['d', 'other'], ['i', '1'], ['x', 'h']] };
    const r = parseVideoChunkAnnouncement(ev, 'demo1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-stream');
  });

  it('parses image frame announcement and rejects non-image mime', () => {
    const okEv = { kind: 1, tags: [['d', 's'], ['i', '2'], ['x', 'h'], ['m', 'image/png']] };
    const ok = parseImageFrameAnnouncement(okEv, 's');
    expect(ok.ok).toBe(true);
    expect(ok.frameId).toBe(2);

    const badEv = { kind: 1, tags: [['d', 's'], ['i', '2'], ['x', 'h'], ['m', 'video/webm']] };
    const bad = parseImageFrameAnnouncement(badEv, 's');
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('not-image');
  });
});
