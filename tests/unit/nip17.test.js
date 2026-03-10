import { describe, it, expect } from 'vitest';
import { nip17, generateSecretKey, getPublicKey } from 'nostr-tools';

function toHex(u8) {
  return Buffer.from(u8).toString('hex');
}

describe('NIP-17 gift wrap', () => {
  it('wrapEvent/unwrapEvent roundtrip with JSON payload', () => {
    const senderSk = generateSecretKey();
    const recipientSk = generateSecretKey();
    const recipientPk = getPublicKey(recipientSk);

    const payload = { type: 'mls_welcome', streamId: 'demo1', v: 1 };
    const wrap = nip17.wrapEvent(senderSk, { publicKey: recipientPk, relays: ['wss://relay.example'] }, JSON.stringify(payload));

    expect(wrap.kind).toBe(1059);
    expect(wrap.tags.find((t) => t[0] === 'p')?.[1]).toBe(recipientPk);

    const inner = nip17.unwrapEvent(wrap, recipientSk);
    expect(inner.kind).toBe(14);
    expect(inner.pubkey).toBe(getPublicKey(senderSk));

    const msg = JSON.parse(inner.content);
    expect(msg).toEqual(payload);
  });

  it('cannot unwrap with wrong recipient key', () => {
    const senderSk = generateSecretKey();
    const recipientSk = generateSecretKey();
    const wrongSk = generateSecretKey();
    const recipientPk = getPublicKey(recipientSk);

    const wrap = nip17.wrapEvent(senderSk, { publicKey: recipientPk, relays: [] }, 'hi');

    expect(() => nip17.unwrapEvent(wrap, wrongSk)).toThrow();
  });
});
