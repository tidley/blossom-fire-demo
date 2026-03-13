import * as nt from 'nostr-tools';

const gift = nt.nip17 || nt.nip59;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hasRecipientPTag(ev, recipientPubHex) {
  return Array.isArray(ev?.tags) && ev.tags.some((t) => t?.[0] === 'p' && t?.[1] === recipientPubHex);
}

export function wrapNip17Event({ senderSk, recipientPubHex, relay, content }) {
  if (!gift?.wrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');

  const skHex = bytesToHex(senderSk);
  const recipient = { publicKey: recipientPubHex, relays: relay ? [relay] : [] };
  const now = Math.floor(Date.now() / 1000);
  const rumor = nt.finalizeEvent(
    { kind: 14, created_at: now, tags: [], content, pubkey: nt.getPublicKey(senderSk) },
    senderSk
  );

  const attempts = [
    ['rumor,skBytes,pub', () => gift.wrapEvent(rumor, senderSk, recipientPubHex)],
    ['rumor,skHex,pub', () => gift.wrapEvent(rumor, skHex, recipientPubHex)],
    ['skBytes,recipientObj,content', () => gift.wrapEvent(senderSk, recipient, content)],
    ['skHex,recipientObj,content', () => gift.wrapEvent(skHex, recipient, content)],
    ['skBytes,pub,content', () => gift.wrapEvent(senderSk, recipientPubHex, content)],
    ['skHex,pub,content', () => gift.wrapEvent(skHex, recipientPubHex, content)],
  ];

  let lastErr = null;
  for (const [name, fn] of attempts) {
    try {
      const ev = fn();
      if (!ev || typeof ev !== 'object') continue;
      if (ev.kind !== 1059) continue;
      if (!hasRecipientPTag(ev, recipientPubHex)) continue;
      return { event: ev, method: name };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('failed to wrap NIP-17 event with recipient p-tag');
}
