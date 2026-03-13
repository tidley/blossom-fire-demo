import assert from 'node:assert/strict';

function normalizeAdminKeyPayload(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.type !== 'adminkey') return null;

  const streamId = msg.streamId ?? msg.stream ?? null;
  const frameId = Number(msg.frameId ?? msg.frame_id ?? msg.frame ?? NaN);
  const blobHash = msg.x ?? msg.hash ?? msg.blob_hash ?? null;
  const key = msg.k ?? msg.key ?? null;
  const keyId = msg.key_id ?? msg.keyId ?? 'default';
  const mime = msg.m ?? msg.mime ?? 'image/webp';
  const alg = msg.alg ?? (msg.enc === 'none' ? 'none' : 'aes-gcm');
  const enc = msg.enc ?? (alg === 'none' ? 'none' : 'nip44');

  if (typeof streamId !== 'string' || !streamId.trim()) return null;
  if (!Number.isFinite(frameId) || frameId <= 0) return null;
  if (typeof blobHash !== 'string' || blobHash.length < 8) return null;

  const isPlain = enc === 'none' || alg === 'none';
  if (!isPlain && (typeof key !== 'string' || key.length < 8)) return null;

  return {
    type: 'adminkey',
    streamId,
    frameId,
    x: blobHash,
    ...(isPlain ? {} : { k: key }),
    key_id: keyId,
    m: mime,
    alg,
    enc,
  };
}

function testCanonicalSchema() {
  const out = normalizeAdminKeyPayload({
    type: 'adminkey',
    streamId: 'xsebcd',
    frameId: 10,
    x: 'abcdef123456',
    k: 'YmFzZTY0a2V5PT0=',
    key_id: 'k1',
    m: 'image/webp',
    alg: 'aes-gcm',
  });
  assert.ok(out);
  assert.equal(out.streamId, 'xsebcd');
  assert.equal(out.frameId, 10);
}

function testAliasSchemaFields() {
  const out = normalizeAdminKeyPayload({
    type: 'adminkey',
    stream: 'xsebcd',
    frame_id: '11',
    hash: 'deadbeefcafebabe',
    key: 'YmFzZTY0a2V5PT0=',
    keyId: 'k2',
    mime: 'image/jpeg',
    alg: 'aes-gcm',
  });
  assert.ok(out);
  assert.equal(out.streamId, 'xsebcd');
  assert.equal(out.frameId, 11);
  assert.equal(out.x, 'deadbeefcafebabe');
  assert.equal(out.k, 'YmFzZTY0a2V5PT0=');
}

function testPlainModeWithoutKey() {
  const out = normalizeAdminKeyPayload({
    type: 'adminkey',
    streamId: 'xsebcd',
    frameId: 12,
    x: 'abcabcabcabc',
    enc: 'none',
    alg: 'none',
  });
  assert.ok(out);
  assert.equal(out.alg, 'none');
}

function testRejectMissingRequired() {
  assert.equal(normalizeAdminKeyPayload({ type: 'adminkey', frameId: 1, x: 'abcabcabcabc', k: 'YmFzZQ==' }), null);
  assert.equal(normalizeAdminKeyPayload({ type: 'adminkey', streamId: 'xsebcd', x: 'abcabcabcabc', k: 'YmFzZQ==' }), null);
  assert.equal(normalizeAdminKeyPayload({ type: 'adminkey', streamId: 'xsebcd', frameId: 1, k: 'YmFzZQ==' }), null);
}

function testRejectWrongType() {
  assert.equal(normalizeAdminKeyPayload({ type: 'viewerkey', streamId: 'x', frameId: 1, x: 'abcabcabcabc', k: 'YmFzZQ==' }), null);
  assert.equal(normalizeAdminKeyPayload(null), null);
}

testCanonicalSchema();
testAliasSchemaFields();
testPlainModeWithoutKey();
testRejectMissingRequired();
testRejectWrongType();

console.log('PASS tests-pushstr-admin-schema-compat (5 cases)');
