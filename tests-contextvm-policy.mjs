import assert from 'node:assert/strict';
import { createAccessPolicyVM } from './web/contextvm.js';

function mkViewers() {
  // sorted by lastSeen desc in resolver logic below
  return [
    { pub: 'pubB', viewer: { npub: 'npubB', allowed: true, lastSeen: 200 } },
    { pub: 'pubC', viewer: { npub: 'npubC', allowed: false, lastSeen: 150 } },
    { pub: 'pubA', viewer: { npub: 'npubA', allowed: false, lastSeen: 100 } },
  ];
}

function resolverFrom(entries) {
  return (index) => {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 1 || i > entries.length) return null;
    const hit = entries[i - 1];
    return { index: i, pub: hit.pub, viewer: hit.viewer };
  };
}

async function testRejectUnauthorizedSender() {
  const vm = createAccessPolicyVM({
    streamId: 's1',
    isSenderAllowed: () => false,
    resolveViewerByIndex: resolverFrom(mkViewers()),
  });
  const r = vm.transition({ type: 'toggle_by_index', index: 1, actor: 'npubX', source: 'dm' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'sender_not_allowed');
}

async function testRejectInvalidIndex() {
  const vm = createAccessPolicyVM({
    streamId: 's1',
    isSenderAllowed: () => true,
    resolveViewerByIndex: resolverFrom(mkViewers()),
  });
  const r = vm.transition({ type: 'toggle_by_index', index: 99, actor: 'npub1', source: 'dm' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_index');
}

async function testProduceDeterministicToggleAction() {
  const entries = mkViewers();
  const vm = createAccessPolicyVM({
    streamId: 's2',
    isSenderAllowed: (npub) => npub === 'npub-controller',
    resolveViewerByIndex: resolverFrom(entries),
  });

  const r = vm.transition({ type: 'toggle_by_index', index: 2, actor: 'npub-controller', source: 'dm' });
  assert.equal(r.ok, true);
  assert.equal(r.action.type, 'set_viewer_allowed');
  assert.equal(r.action.viewerPub, 'pubC');
  assert.equal(r.action.allowed, true); // was false -> true
  assert.equal(r.transition.ok, true);
  assert.equal(r.transition.index, 2);
}

await testRejectUnauthorizedSender();
await testRejectInvalidIndex();
await testProduceDeterministicToggleAction();

console.log('PASS tests-contextvm-policy (3 cases)');
