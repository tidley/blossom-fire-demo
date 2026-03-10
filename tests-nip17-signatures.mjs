import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, nip17, nip59 } from 'nostr-tools';

const gift = nip17 || nip59;
assert.ok(gift?.wrapEvent && gift?.unwrapEvent, 'gift-wrap API unavailable');

const senderSk = generateSecretKey();
const recipientSk = generateSecretKey();
const recipientPub = getPublicKey(recipientSk);
const content = JSON.stringify({ type: 'sig-test' });
const rumor = { kind: 14, created_at: Math.floor(Date.now() / 1000), tags: [], content };

let success = 0;
const attempts = [
  () => gift.wrapEvent(senderSk, { publicKey: recipientPub, relays: ['wss://example.invalid'] }, content),
  () => gift.wrapEvent(rumor, senderSk, recipientPub),
  () => gift.wrapEvent(Buffer.from(senderSk).toString('hex'), { publicKey: recipientPub, relays: ['wss://example.invalid'] }, content),
  () => gift.wrapEvent(rumor, Buffer.from(senderSk).toString('hex'), recipientPub),
];

for (const fn of attempts) {
  try {
    const wrap = fn();
    const inner = gift.unwrapEvent(wrap, recipientSk);
    assert.equal(inner.kind, 14);
    success++;
  } catch {
    // variant unsupported by this build
  }
}

assert.ok(success >= 1, 'at least one wrapEvent signature should work');
console.log('PASS tests-nip17-signatures (working variants:', success, ')');
