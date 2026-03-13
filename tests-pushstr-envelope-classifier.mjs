import assert from 'node:assert/strict';

function classifyEnvelope(ev, adminPub) {
  if (!ev || typeof ev !== 'object') return { ok: false, reason: 'bad_event' };
  if (ev.kind !== 1059) return { ok: false, reason: 'wrong_kind' };
  const tags = Array.isArray(ev.tags) ? ev.tags : [];
  const hasP = tags.some((t) => t?.[0] === 'p' && t?.[1] === adminPub);
  if (!hasP) return { ok: false, reason: 'missing_recipient_tag' };
  if (typeof ev.content !== 'string' || !ev.content.trim()) return { ok: false, reason: 'empty_content' };
  return { ok: true, reason: 'candidate' };
}

const adminPub = '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';

assert.deepEqual(
  classifyEnvelope({ kind: 1059, tags: [['p', adminPub]], content: 'AbCd==' }, adminPub),
  { ok: true, reason: 'candidate' }
);

assert.equal(classifyEnvelope({ kind: 14, tags: [['p', adminPub]], content: 'x' }, adminPub).reason, 'wrong_kind');
assert.equal(classifyEnvelope({ kind: 1059, tags: [['p', 'abc']], content: 'x' }, adminPub).reason, 'missing_recipient_tag');
assert.equal(classifyEnvelope({ kind: 1059, tags: [['p', adminPub]], content: '' }, adminPub).reason, 'empty_content');

console.log('PASS tests-pushstr-envelope-classifier (4 cases)');
