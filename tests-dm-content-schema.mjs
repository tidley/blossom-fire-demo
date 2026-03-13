import assert from 'node:assert/strict';

function parseJsonSafe(raw) {
  try {
    return { ok: true, value: JSON.parse(String(raw || '')) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function validateAdminKeyMsg(msg, expectedStreamId) {
  if (!msg || typeof msg !== 'object') return { ok: false, reason: 'not_object' };
  if (msg.type !== 'adminkey') return { ok: false, reason: 'wrong_type' };
  if (msg.streamId !== expectedStreamId) return { ok: false, reason: 'wrong_stream' };

  const frameId = Number(msg.frameId);
  if (!Number.isFinite(frameId) || frameId <= 0) return { ok: false, reason: 'bad_frameId' };

  if (typeof msg.x !== 'string' || msg.x.length < 8) return { ok: false, reason: 'bad_hash' };

  const isPlain = msg.enc === 'none' || msg.alg === 'none';
  if (!isPlain) {
    if (typeof msg.k !== 'string' || msg.k.length < 8) return { ok: false, reason: 'missing_key' };
  }

  return { ok: true };
}

function classifyDmContent(raw, expectedStreamId) {
  const parsed = parseJsonSafe(raw);
  if (!parsed.ok) return { kind: 'non_json' };
  const v = validateAdminKeyMsg(parsed.value, expectedStreamId);
  if (v.ok) return { kind: 'adminkey_ok' };
  return { kind: `drop_${v.reason}` };
}

function testRejectsNonJsonNoise() {
  const out = classifyDmContent('AtHBiyv/YjVa+ESX+41V+D1+Ur0VTx8C', 'xsebcd');
  assert.equal(out.kind, 'non_json');
}

function testAcceptsValidAdminKeyJson() {
  const raw = JSON.stringify({
    type: 'adminkey',
    streamId: 'xsebcd',
    frameId: 22,
    x: 'abc12345def',
    k: 'YmFzZTY0LWtleQ==',
    key_id: 'k1',
    m: 'image/webp',
    alg: 'aes-gcm',
    v: 1,
  });
  const out = classifyDmContent(raw, 'xsebcd');
  assert.equal(out.kind, 'adminkey_ok');
}

function testRejectsWrongStream() {
  const raw = JSON.stringify({
    type: 'adminkey',
    streamId: 'other',
    frameId: 1,
    x: 'abc12345def',
    k: 'YmFzZTY0LWtleQ==',
  });
  const out = classifyDmContent(raw, 'xsebcd');
  assert.equal(out.kind, 'drop_wrong_stream');
}

function testRejectsMissingKeyOnEncryptedPayload() {
  const raw = JSON.stringify({
    type: 'adminkey',
    streamId: 'xsebcd',
    frameId: 1,
    x: 'abc12345def',
    alg: 'aes-gcm',
  });
  const out = classifyDmContent(raw, 'xsebcd');
  assert.equal(out.kind, 'drop_missing_key');
}

function testAcceptsPlainModeWithoutKey() {
  const raw = JSON.stringify({
    type: 'adminkey',
    streamId: 'xsebcd',
    frameId: 2,
    x: 'abc12345def',
    alg: 'none',
    enc: 'none',
  });
  const out = classifyDmContent(raw, 'xsebcd');
  assert.equal(out.kind, 'adminkey_ok');
}

testRejectsNonJsonNoise();
testAcceptsValidAdminKeyJson();
testRejectsWrongStream();
testRejectsMissingKeyOnEncryptedPayload();
testAcceptsPlainModeWithoutKey();

console.log('PASS tests-dm-content-schema (5 cases)');
