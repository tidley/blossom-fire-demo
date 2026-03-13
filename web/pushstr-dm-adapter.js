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

function extractFirstJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

export function parseDmJsonPushstrCompat(rawContent) {
  const raw = String(rawContent || '').trim();
  if (!raw) return { msg: null, parseMode: 'empty', raw };

  try {
    return { msg: JSON.parse(raw), parseMode: 'strict', raw };
  } catch {}

  const candidate = extractFirstJsonObject(raw);
  if (candidate) {
    try {
      return { msg: JSON.parse(candidate), parseMode: 'extracted_object', raw };
    } catch {}
  }

  return { msg: null, parseMode: 'non_json', raw };
}

export function unwrapDmJsonPushstrCompat({ recipientSk, wrapEv }) {
  if (!giftWrap?.unwrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
  const inner = giftWrap.unwrapEvent(wrapEv, toPrivkeyInput(recipientSk));
  const parsed = parseDmJsonPushstrCompat(inner?.content || '');
  return { inner, msg: parsed.msg, parseMode: parsed.parseMode, rawContent: parsed.raw };
}

export function unwrapDmJsonPushstrCompatAdmin({ recipientSk, wrapEv }) {
  try {
    const out = unwrapDmJsonPushstrCompat({ recipientSk, wrapEv });
    return { ...out, classifier: out.msg ? 'ok' : `drop:${out.parseMode}` };
  } catch (e) {
    return {
      inner: null,
      msg: null,
      parseMode: 'unwrap_error',
      rawContent: '',
      classifier: 'drop:unwrap_error',
      error: e,
    };
  }
}
