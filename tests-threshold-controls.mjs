import assert from 'node:assert/strict';
import { createThresholdController } from './web/context-threshold.js';

const isAdmin = (a) => a === 'admin';

async function testAdminImmediate() {
  const t = createThresholdController({ threshold: 2, isAdmin });
  const r = t.decide({ actor: 'admin', viewerPub: 'v1', currentAllowed: false });
  assert.equal(r.ok, true);
  assert.equal(r.apply, true);
  assert.equal(r.allowed, true);
}

async function testLockedRejectsNonAdmin() {
  const t = createThresholdController({ threshold: 2, isAdmin });
  const r = t.decide({ actor: 'u1', viewerPub: 'v1', currentAllowed: false });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'locked_admin_override');
}

async function testUnlockAndTwoVotes() {
  const t = createThresholdController({ threshold: 2, isAdmin });
  assert.equal(t.toggleUnlock('admin').unlocked, true);
  const v1 = t.decide({ actor: 'u1', viewerPub: 'v1', currentAllowed: false });
  assert.equal(v1.ok, true);
  assert.equal(v1.apply, false);
  assert.equal(v1.votes, 1);
  const v2 = t.decide({ actor: 'u2', viewerPub: 'v1', currentAllowed: false });
  assert.equal(v2.ok, true);
  assert.equal(v2.apply, true);
  assert.equal(v2.allowed, true);
}

await testAdminImmediate();
await testLockedRejectsNonAdmin();
await testUnlockAndTwoVotes();
console.log('PASS tests-threshold-controls (3 cases)');
