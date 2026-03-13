import assert from 'node:assert/strict';

function classifyDm(msg, streamId) {
  if (!msg || msg.type !== 'adminkey') return 'drop_type';
  if (msg.streamId !== streamId) return 'drop_stream';
  return 'accept_adminkey';
}

function testDropsNonAdminKeyTypes() {
  assert.equal(classifyDm(null, 'x'), 'drop_type');
  assert.equal(classifyDm({ type: 'access_req', streamId: 'x' }, 'x'), 'drop_type');
  assert.equal(classifyDm({ type: 'viewerkey', streamId: 'x' }, 'x'), 'drop_type');
}

function testDropsWrongStream() {
  assert.equal(classifyDm({ type: 'adminkey', streamId: 'demo1' }, 'demo2'), 'drop_stream');
}

function testAcceptsMatchingAdminKey() {
  assert.equal(classifyDm({ type: 'adminkey', streamId: 'xsebcd', frameId: 10 }, 'xsebcd'), 'accept_adminkey');
}

testDropsNonAdminKeyTypes();
testDropsWrongStream();
testAcceptsMatchingAdminKey();

console.log('PASS tests-admin-adminkey-filtering (3 cases)');
