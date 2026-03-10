// NIP-17 transport wrapper (placeholder).
//
// NIP-17 is "gift wrap" and is *not* the same as kind:4 DMs.
// This branch scaffolds a transport API but intentionally ships a
// compatibility implementation using kind:4 + NIP-44 so the demo keeps working.
//
// TODO(mls): implement real NIP-17 envelope kinds/tags once we add a proper lib.

import { makeSignedEventUnsigned, publish, nip44Encrypt, nip44Decrypt, sub } from './util.js';

// Send an encrypted JSON payload to a recipient.
//
// Current placeholder:
// - encrypt with NIP-44
// - send kind 4 DM
export async function nip17SendJson({ sk, recipientPubkey, tags = [], payload }) {
  const plaintext = JSON.stringify(payload);
  const enc = nip44Encrypt(sk, recipientPubkey, plaintext);
  const ev = makeSignedEventUnsigned(4, sk, {
    content: enc,
    tags: [ ['p', recipientPubkey], ...tags ],
  });
  await publish(ev);
  return ev;
}

// Subscribe and yield decrypted JSON messages.
//
// Current placeholder subscribes to kind 4 addressed to us.
export function nip17SubJson({ sk, pubkey, filters = [], onMessage }) {
  const base = { kinds: [4], '#p': [pubkey], limit: 200 };
  const all = [base, ...filters];

  return sub(all, (ev) => {
    try {
      const plaintext = nip44Decrypt(sk, ev.pubkey, ev.content);
      const payload = JSON.parse(plaintext);
      onMessage(payload, ev);
    } catch (_e) {
      // not decryptable or not JSON
    }
  });
}
