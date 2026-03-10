import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, nip44 } from 'nostr-tools';
import { nip44EncryptWith, nip44DecryptWith } from '../../web/nip44wrap.js';

describe('NIP-44 wrappers', () => {
  it('uses getConversationKey and roundtrips', () => {
    const aSk = generateSecretKey();
    const aPk = getPublicKey(aSk);
    const bSk = generateSecretKey();
    const bPk = getPublicKey(bSk);

    const calls = [];
    const nip44Shim = {
      getConversationKey: (sk, pk) => {
        calls.push([sk, pk]);
        return nip44.getConversationKey(sk, pk);
      },
      encrypt: nip44.encrypt,
      decrypt: nip44.decrypt,
    };

    const pt = JSON.stringify({ hello: 'world', t: Date.now() });
    const ct = nip44EncryptWith(nip44Shim, aSk, bPk, pt);
    const dec = nip44DecryptWith(nip44Shim, bSk, aPk, ct);

    expect(dec).toBe(pt);

    // Ensure expected call signature (sk, pubkeyHex)
    expect(calls).toEqual([
      [aSk, bPk],
      [bSk, aPk],
    ]);
  });
});
