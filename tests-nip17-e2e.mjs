import assert from 'node:assert/strict';
import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip17,
  nip19,
  nip59,
} from 'nostr-tools';

const RELAY_PUBLIC = process.env.RELAY_PUBLIC || 'wss://relay.tomdwyer.uk';
const RELAY_NIP17 = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);

const gift = nip17 || nip59;
if (!gift?.wrapEvent || !gift?.unwrapEvent) {
  throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
}

function now() {
  return Math.floor(Date.now() / 1000);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const pool = new SimplePool();

  // Roles (mirrors app roles)
  const adminSk = generateSecretKey();
  const adminPub = getPublicKey(adminSk);
  const viewerSk = generateSecretKey();
  const viewerPub = getPublicKey(viewerSk);
  const broadcasterSk = generateSecretKey();
  const broadcasterPub = getPublicKey(broadcasterSk);

  const streamId = `e2e-${Date.now()}`;
  const marker = `m-${Date.now()}`;

  console.log('E2E setup', {
    streamId,
    adminNpub: nip19.npubEncode(adminPub),
    viewerNpub: nip19.npubEncode(viewerPub),
    broadcasterNpub: nip19.npubEncode(broadcasterPub),
    RELAY_PUBLIC,
    RELAY_NIP17,
  });

  // ---------- Phase 1: viewer access request (kind 1) ----------
  let sawAccessReqOnPublic = null;
  const subPublic = pool.subscribeMany(
    [RELAY_PUBLIC],
    [{ kinds: [1], '#t': ['blossom-fire-demo-req'], since: now() - 5, limit: 50 }],
    {
      onevent: (ev) => {
        const d = ev.tags.find((t) => t[0] === 'd')?.[1];
        if (ev.pubkey === viewerPub && d === streamId) sawAccessReqOnPublic = ev;
      },
    }
  );

  const req = {
    kind: 1,
    created_at: now(),
    tags: [
      ['t', 'blossom-fire-demo-req'],
      ['d', streamId],
    ],
    content: 'request-video',
    pubkey: viewerPub,
  };
  const reqEv = finalizeEvent(req, viewerSk);
  await Promise.race([
    Promise.any(pool.publish([RELAY_PUBLIC], reqEv).map((p) => p)).catch(() => null),
    sleep(2000),
  ]);

  await waitFor(() => sawAccessReqOnPublic, TIMEOUT_MS, 'public access request');

  // ---------- Phase 2: viewer fallback access_req over NIP-17 ----------
  let sawAccessReqOnAdmin = null;
  const subAdminDm = pool.subscribeMany(
    [RELAY_NIP17],
    [{ kinds: [1059], '#p': [adminPub], since: now() - 5, limit: 200 }],
    {
      onevent: (ev) => {
        try {
          const inner = gift.unwrapEvent(ev, adminSk);
          const msg = JSON.parse(inner.content || '{}');
          if (msg.type === 'access_req' && msg.streamId === streamId && inner.pubkey === viewerPub) {
            sawAccessReqOnAdmin = { ev, inner, msg };
          }
        } catch {}
      },
    }
  );

  const accessReqWrap = gift.wrapEvent(
    viewerSk,
    { publicKey: adminPub, relays: [RELAY_NIP17] },
    JSON.stringify({ type: 'access_req', role: 'viewer-video', streamId, marker })
  );
  await Promise.race([
    Promise.any(pool.publish([RELAY_NIP17], accessReqWrap).map((p) => p)).catch(() => null),
    sleep(2000),
  ]);
  await waitFor(() => sawAccessReqOnAdmin, TIMEOUT_MS, 'admin receiving access_req via NIP-17');

  // ---------- Phase 3: broadcaster adminkey over NIP-17 ----------
  let sawAdminKeyOnAdmin = null;
  const frameId = 1;
  const keyPayload = {
    type: 'adminkey',
    streamId,
    frameId,
    x: `deadbeef${marker}`,
    k: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    m: 'video/webm',
    alg: 'aes-gcm',
    v: 1,
  };

  const adminKeyWrap = gift.wrapEvent(
    broadcasterSk,
    { publicKey: adminPub, relays: [RELAY_NIP17] },
    JSON.stringify(keyPayload)
  );
  await Promise.race([
    Promise.any(pool.publish([RELAY_NIP17], adminKeyWrap).map((p) => p)).catch(() => null),
    sleep(2000),
  ]);

  await waitFor(
    () => {
      if (sawAdminKeyOnAdmin) return sawAdminKeyOnAdmin;
      // Reuse live stream in callback approach via requery to keep script simple
      return null;
    },
    10,
    'noop'
  ).catch(() => {});

  // Directly verify by subscribing short-lived and matching adminkey
  let gotAdminKey = null;
  const subAdminKey = pool.subscribeMany(
    [RELAY_NIP17],
    [{ kinds: [1059], '#p': [adminPub], since: now() - 30, limit: 200 }],
    {
      onevent: (ev) => {
        try {
          const inner = gift.unwrapEvent(ev, adminSk);
          const msg = JSON.parse(inner.content || '{}');
          if (msg.type === 'adminkey' && msg.streamId === streamId && msg.frameId === frameId) {
            gotAdminKey = { ev, inner, msg };
          }
        } catch {}
      },
    }
  );

  await waitFor(() => gotAdminKey, TIMEOUT_MS, 'admin receiving adminkey via NIP-17');

  // ---------- Phase 4: admin forwards viewerkey over NIP-17 ----------
  let gotViewerKey = null;
  const subViewer = pool.subscribeMany(
    [RELAY_NIP17],
    [{ kinds: [1059], '#p': [viewerPub], since: now() - 5, limit: 200 }],
    {
      onevent: (ev) => {
        try {
          const inner = gift.unwrapEvent(ev, viewerSk);
          const msg = JSON.parse(inner.content || '{}');
          if (msg.type === 'viewerkey' && msg.streamId === streamId && msg.frameId === frameId) {
            gotViewerKey = { ev, inner, msg };
          }
        } catch {}
      },
    }
  );

  const viewerWrap = gift.wrapEvent(
    adminSk,
    { publicKey: viewerPub, relays: [RELAY_NIP17] },
    JSON.stringify({ ...keyPayload, type: 'viewerkey' })
  );
  await Promise.race([
    Promise.any(pool.publish([RELAY_NIP17], viewerWrap).map((p) => p)).catch(() => null),
    sleep(2000),
  ]);

  await waitFor(() => gotViewerKey, TIMEOUT_MS, 'viewer receiving viewerkey via NIP-17');

  // Assertions summary
  assert.ok(sawAccessReqOnPublic, 'phase1 public access request missing');
  assert.ok(sawAccessReqOnAdmin, 'phase2 admin access_req DM missing');
  assert.ok(gotAdminKey, 'phase3 adminkey DM missing');
  assert.ok(gotViewerKey, 'phase4 viewerkey DM missing');

  subPublic.close?.();
  subAdminDm.close?.();
  subAdminKey.close?.();
  subViewer.close?.();
  pool.close?.([RELAY_PUBLIC, RELAY_NIP17]);

  console.log('PASS tests-nip17-e2e', { streamId, marker });
}

main().catch((e) => {
  console.error('FAIL tests-nip17-e2e', e?.message || e);
  process.exit(1);
});
