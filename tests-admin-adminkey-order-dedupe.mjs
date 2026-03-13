import assert from 'node:assert/strict';

function applyAdminKeyState(state, { frameId, blobHash, keyId }) {
  const next = { ...state, seen: new Set(state.seen) };

  if (frameId <= next.lastAcceptedFrameId) {
    next.rejectedOldFrame += 1;
    return { accepted: false, reason: 'old', state: next };
  }

  const dedupeKey = `${frameId}|${blobHash}|${keyId}`;
  if (next.seen.has(dedupeKey)) {
    next.rejectedDuplicate += 1;
    return { accepted: false, reason: 'dup', state: next };
  }

  next.seen.add(dedupeKey);
  next.lastAcceptedFrameId = frameId;
  return { accepted: true, reason: 'ok', state: next };
}

let st = { lastAcceptedFrameId: 0, rejectedOldFrame: 0, rejectedDuplicate: 0, seen: new Set() };

let out = applyAdminKeyState(st, { frameId: 10, blobHash: 'h1', keyId: 'k1' });
assert.equal(out.accepted, true);
st = out.state;

out = applyAdminKeyState(st, { frameId: 9, blobHash: 'h0', keyId: 'k0' });
assert.equal(out.accepted, false);
assert.equal(out.reason, 'old');
assert.equal(out.state.rejectedOldFrame, 1);
st = out.state;

out = applyAdminKeyState(st, { frameId: 11, blobHash: 'h2', keyId: 'k2' });
assert.equal(out.accepted, true);
st = out.state;

out = applyAdminKeyState(st, { frameId: 11, blobHash: 'h2', keyId: 'k2' });
assert.equal(out.accepted, false);
assert.equal(out.reason, 'old'); // old check triggers before dedupe for same frame

console.log('PASS tests-admin-adminkey-order-dedupe (4 cases)');
