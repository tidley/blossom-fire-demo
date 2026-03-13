import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { wrapNip17Event } from './scripts/nip17-wrap.mjs';

async function testWrapIncludesRecipientTag() {
  const senderSk = generateSecretKey();
  const recipientSk = generateSecretKey();
  const recipientPub = getPublicKey(recipientSk);

  const { event, method } = wrapNip17Event({
    senderSk,
    recipientPubHex: recipientPub,
    relay: 'wss://nip17.tomdwyer.uk',
    content: JSON.stringify({ type: 'test', x: 1 }),
  });

  assert.ok(event);
  assert.equal(event.kind, 1059);
  assert.ok(event.id);
  assert.ok(Array.isArray(event.tags));
  assert.ok(event.tags.some((t) => t[0] === 'p' && t[1] === recipientPub), 'missing recipient p-tag');
  assert.ok(method);
}

await testWrapIncludesRecipientTag();
console.log('PASS tests-nip17-wrap-helper (1 case)');
