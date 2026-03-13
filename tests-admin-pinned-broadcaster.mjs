import assert from 'node:assert/strict';

function shouldAcceptAdminKey({ pinnedPub, senderPub }) {
  if (!pinnedPub) return { accept: true, nextPinned: senderPub, rejected: false };
  if (pinnedPub !== senderPub) return { accept: false, nextPinned: pinnedPub, rejected: true };
  return { accept: true, nextPinned: pinnedPub, rejected: false };
}

let st = shouldAcceptAdminKey({ pinnedPub: null, senderPub: 'pubA' });
assert.equal(st.accept, true);
assert.equal(st.nextPinned, 'pubA');

st = shouldAcceptAdminKey({ pinnedPub: 'pubA', senderPub: 'pubA' });
assert.equal(st.accept, true);
assert.equal(st.rejected, false);

st = shouldAcceptAdminKey({ pinnedPub: 'pubA', senderPub: 'pubB' });
assert.equal(st.accept, false);
assert.equal(st.rejected, true);
assert.equal(st.nextPinned, 'pubA');

console.log('PASS tests-admin-pinned-broadcaster (3 cases)');
