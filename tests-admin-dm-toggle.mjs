import assert from 'node:assert/strict';

function getSortedViewerEntries(viewers) {
  return Array.from(viewers.entries()).sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
}

function parseControlIndex(rawContent, msg) {
  const raw = String(rawContent || '').trim();
  const numberText = /^\d+$/.test(raw) ? Number(raw) : null;
  const jsonToggle = msg && typeof msg === 'object' && msg.type === 'toggle_viewer'
    ? Number(msg.index ?? msg.n ?? msg.viewer)
    : null;
  return Number.isFinite(numberText) ? numberText : (Number.isFinite(jsonToggle) ? jsonToggle : null);
}

async function toggleViewerByIndex(viewers, index) {
  const entries = getSortedViewerEntries(viewers);
  const idx = Number(index);
  if (!Number.isFinite(idx) || idx < 1 || idx > entries.length) return false;
  const [pub, v] = entries[idx - 1];
  v.allowed = !v.allowed;
  viewers.set(pub, v);
  return true;
}

function mkViewers() {
  return new Map([
    ['pubA', { allowed: false, lastSeen: 100, npub: 'npubA' }],
    ['pubB', { allowed: true,  lastSeen: 200, npub: 'npubB' }],
    ['pubC', { allowed: false, lastSeen: 150, npub: 'npubC' }],
  ]);
}

async function testNumericDmParses() {
  assert.equal(parseControlIndex('2', null), 2);
  assert.equal(parseControlIndex('  12 ', null), 12);
  assert.equal(parseControlIndex('x2', null), null);
  assert.equal(parseControlIndex('', null), null);
}

async function testJsonToggleParses() {
  assert.equal(parseControlIndex('', { type: 'toggle_viewer', index: 3 }), 3);
  assert.equal(parseControlIndex('', { type: 'toggle_viewer', n: 2 }), 2);
  assert.equal(parseControlIndex('', { type: 'toggle_viewer', viewer: 1 }), 1);
  assert.equal(parseControlIndex('', { type: 'adminkey', frameId: 9 }), null);
}

async function testToggleUsesVisibleOrdering() {
  const viewers = mkViewers();
  const ordered = getSortedViewerEntries(viewers);
  // by lastSeen: pubB(200), pubC(150), pubA(100)
  assert.equal(ordered[0][0], 'pubB');
  assert.equal(ordered[1][0], 'pubC');
  assert.equal(ordered[2][0], 'pubA');

  // toggle #2 => pubC
  const ok = await toggleViewerByIndex(viewers, 2);
  assert.equal(ok, true);
  assert.equal(viewers.get('pubC').allowed, true);

  // toggle invalid
  assert.equal(await toggleViewerByIndex(viewers, 0), false);
  assert.equal(await toggleViewerByIndex(viewers, 99), false);
}

await testNumericDmParses();
await testJsonToggleParses();
await testToggleUsesVisibleOrdering();

console.log('PASS tests-admin-dm-toggle (3 cases)');
