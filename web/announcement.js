// Parsing helpers for public kind-1 announcements used by the demo.

function tagValue(tags, name) {
  const t = tags?.find?.((t) => t[0] === name);
  return t ? t[1] : null;
}

/**
 * Parse a kind-1 video chunk announcement.
 * Expected tags: ['d', streamId], ['i', chunkId], ['x', blobHash], optional ['m', mime], ['c', codec]
 */
export function parseVideoChunkAnnouncement(ev, streamId) {
  if (!ev || ev.kind !== 1) return { ok: false, reason: 'not-kind-1' };
  const d = tagValue(ev.tags, 'd');
  if (d !== streamId) return { ok: false, reason: 'wrong-stream' };

  const id = tagValue(ev.tags, 'i');
  const x = tagValue(ev.tags, 'x');
  if (!id || !x) return { ok: false, reason: 'missing-tags' };

  const chunkId = Number(id);
  if (!Number.isFinite(chunkId) || chunkId < 0) return { ok: false, reason: 'bad-chunkId' };

  const mime = tagValue(ev.tags, 'm') || 'video/webm';
  if (!mime.startsWith('video/')) return { ok: false, reason: 'not-video' };
  const codec = tagValue(ev.tags, 'c') || mime;

  return { ok: true, chunkId, blobHash: x, mime, codec };
}

/**
 * Parse a kind-1 slideshow frame announcement.
 * Expected tags: ['d', streamId], ['i', frameId], ['x', blobHash], optional ['m', mime]
 */
export function parseImageFrameAnnouncement(ev, streamId) {
  if (!ev || ev.kind !== 1) return { ok: false, reason: 'not-kind-1' };
  const d = tagValue(ev.tags, 'd');
  if (d !== streamId) return { ok: false, reason: 'wrong-stream' };

  const id = tagValue(ev.tags, 'i');
  const x = tagValue(ev.tags, 'x');
  if (!id || !x) return { ok: false, reason: 'missing-tags' };

  const frameId = Number(id);
  if (!Number.isFinite(frameId) || frameId < 0) return { ok: false, reason: 'bad-frameId' };

  const mime = tagValue(ev.tags, 'm') || 'image/jpeg';
  if (!mime.startsWith('image/')) return { ok: false, reason: 'not-image' };

  return { ok: true, frameId, blobHash: x, mime };
}
