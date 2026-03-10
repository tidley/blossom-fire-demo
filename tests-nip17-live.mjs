import assert from 'node:assert/strict';
import {
  SimplePool,
  generateSecretKey,
  getPublicKey,
  nip17,
  nip59,
} from 'nostr-tools';

const RELAY = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);

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

async function main() {
  const pool = new SimplePool();
  const senderSk = generateSecretKey();
  const recipientSk = generateSecretKey();
  const recipientPub = getPublicKey(recipientSk);

  const marker = `live-${Date.now()}`;
  const payload = { type: 'live_smoke', marker, ts: now() };
  const content = JSON.stringify(payload);

  let got = null;
  const since = now() - 5;

  const sub = pool.subscribeMany([RELAY], [{ kinds: [1059], '#p': [recipientPub], since, limit: 20 }], {
    onevent: (ev) => {
      try {
        const inner = gift.unwrapEvent(ev, recipientSk);
        const msg = JSON.parse(inner.content || '{}');
        if (msg.marker === marker) got = { ev, inner, msg };
      } catch {
        // ignore unrelated/non-decryptable wraps
      }
    },
  });

  await sleep(250);

  const recipient = { publicKey: recipientPub, relays: [RELAY] };
  const wrap = gift.wrapEvent(senderSk, recipient, content);

  const pubs = pool.publish([RELAY], wrap);
  await Promise.race([
    Promise.any(pubs.map((p) => p)).catch(() => null),
    sleep(2000),
  ]);

  const started = Date.now();
  while (!got && Date.now() - started < TIMEOUT_MS) {
    await sleep(200);
  }

  sub.close?.();
  pool.close?.([RELAY]);

  assert.ok(got, `did not receive/decrypt smoke NIP-17 message from ${RELAY}`);
  assert.equal(got.inner.kind, 14);
  assert.equal(got.msg.type, 'live_smoke');
  console.log('PASS tests-nip17-live', { relay: RELAY, marker });
}

main().catch((e) => {
  console.error('FAIL tests-nip17-live', e?.message || e);
  process.exit(1);
});
