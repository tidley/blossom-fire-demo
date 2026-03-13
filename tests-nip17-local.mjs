import assert from 'node:assert/strict';
import {
  generateSecretKey,
  getPublicKey,
  nip17,
  nip59,
} from 'nostr-tools';

const gift = nip17 || nip59;
assert.ok(gift, 'nostr-tools must expose nip17 or nip59');

const aliceSk = generateSecretKey();
const bobSk = generateSecretKey();
const bobPub = getPublicKey(bobSk);

const payload = { type: 'smoke', streamId: 'demo1', n: 42 };
const content = JSON.stringify(payload);

// Signature variant 1 (sender-first)
let wrap;
try {
  wrap = gift.wrapEvent(aliceSk, { publicKey: bobPub, relays: ['wss://example.invalid'] }, content);
} catch {
  // Signature variant 2 (event-first)
  const rumor = { kind: 14, created_at: Math.floor(Date.now() / 1000), tags: [], content };
  wrap = gift.wrapEvent(rumor, aliceSk, bobPub);
}

assert.equal(wrap.kind, 1059, 'gift-wrap outer kind must be 1059');
assert.ok(Array.isArray(wrap.tags), 'gift-wrap must include tags');
assert.ok(wrap.tags.some((t) => t[0] === 'p' && t[1] === bobPub), 'gift-wrap must target bob pubkey');

const inner = gift.unwrapEvent(wrap, bobSk);
assert.equal(inner.kind, 14, 'inner rumor kind must be 14');
assert.equal(inner.pubkey, getPublicKey(aliceSk), 'inner event pubkey should be sender');
const decoded = JSON.parse(inner.content);
assert.deepEqual(decoded, payload, 'decoded payload should match');

console.log('PASS tests-nip17-local');
