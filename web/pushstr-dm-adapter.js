import * as nostrTools from "https://esm.sh/nostr-tools@2.18.2";

// Extraction scaffold for Pushstr DM tooling.
// TODO: Replace internals with pushstr-native nip17/nip44 pipeline.

const giftWrap = nostrTools.nip17 || nostrTools.nip59;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toPrivkeyInput(sk) {
  return sk instanceof Uint8Array ? bytesToHex(sk) : sk;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

export function wrapDmJsonPushstrCompat({ senderSk, recipientPubkeyHex, payload, relays = [] }) {
  if (!giftWrap?.wrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
  const recipient = { publicKey: recipientPubkeyHex, relays };
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const skHex = toPrivkeyInput(senderSk);
  const rumor = { kind: 14, created_at: now(), tags: [], content };

  const attempts = [
    () => giftWrap.wrapEvent(rumor, senderSk, recipientPubkeyHex),
    () => giftWrap.wrapEvent(rumor, skHex, recipientPubkeyHex),
    () => giftWrap.wrapEvent(senderSk, recipient, content),
    () => giftWrap.wrapEvent(skHex, recipient, content),
    () => giftWrap.wrapEvent(senderSk, recipientPubkeyHex, content),
    () => giftWrap.wrapEvent(skHex, recipientPubkeyHex, content),
  ];

  let lastErr = null;
  for (const fn of attempts) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('pushstr-compat wrap failed');
}

export function unwrapDmJsonPushstrCompat({ recipientSk, wrapEv }) {
  if (!giftWrap?.unwrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
  const inner = giftWrap.unwrapEvent(wrapEv, toPrivkeyInput(recipientSk));
  let msg = null;
  try { msg = JSON.parse(inner.content || 'null'); } catch {}
  return { inner, msg };
}
