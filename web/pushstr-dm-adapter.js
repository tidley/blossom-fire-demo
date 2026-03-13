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

function parseRumorEventMaybe(rawContent) {
  const raw = String(rawContent || '').trim();
  if (!raw) return null;
  try {
    const maybe = JSON.parse(raw);
    if (maybe && typeof maybe === 'object' && Number.isFinite(maybe.kind) && typeof maybe.content === 'string') {
      return maybe;
    }
  } catch {}
  return null;
}

function decryptNip44WithFallback(recipientSk, senderPub, cipherText) {
  const skHex = toPrivkeyInput(recipientSk);
  const conv = nostrTools?.nip44?.getConversationKey?.(skHex, senderPub);
  if (!conv) throw new Error('nip44 conversation key unavailable');

  const attempts = [
    () => nostrTools?.nip44?.decrypt?.(cipherText, conv),
    () => nostrTools?.nip44?.v2?.decrypt?.(cipherText, conv),
  ];

  let lastErr = null;
  for (const fn of attempts) {
    try {
      const out = fn?.();
      if (typeof out === 'string') return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('nip44 decrypt failed');
}

export function unwrapDmJsonPushstrCompat({ recipientSk, wrapEv }) {
  if (!giftWrap?.unwrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');

  const stage = { step: 'gift_decrypt' };
  const inner = giftWrap.unwrapEvent(wrapEv, toPrivkeyInput(recipientSk));

  stage.step = 'inner_verify';
  let verified = false;
  try {
    verified = typeof nostrTools.verifyEvent === 'function' ? !!nostrTools.verifyEvent(inner) : false;
  } catch {
    verified = false;
  }

  stage.step = 'inner_parse';
  let parsed = parseDmJsonPushstrCompat(inner?.content || '');

  // Pushstr-like sealed rumor handling: if inner content itself is a serialized event,
  // parse that and then parse its content as app JSON.
  let rumor = null;
  const parsedLooksLikeRumorEvent = parsed.msg && typeof parsed.msg === 'object' && Number.isFinite(parsed.msg.kind) && typeof parsed.msg.content === 'string' && !parsed.msg.type;
  if (!parsed.msg || parsedLooksLikeRumorEvent) {
    stage.step = 'rumor_parse';
    rumor = parsedLooksLikeRumorEvent ? parsed.msg : parseRumorEventMaybe(inner?.content || '');

    // Pushstr sealed-event path: kind 13 content is still nip44 encrypted rumor JSON.
    if (rumor?.kind === 13 && typeof rumor?.content === 'string' && rumor?.pubkey) {
      stage.step = 'rumor_decrypt';
      try {
        const rumorJson = decryptNip44WithFallback(recipientSk, rumor.pubkey, rumor.content);
        const parsedRumor = parseRumorEventMaybe(rumorJson);
        if (parsedRumor) {
          rumor = parsedRumor;
        }
      } catch {
        // keep existing rumor as-is and let downstream diagnostics classify failure/no-json
      }
    }

    if (rumor?.content) {
      parsed = parseDmJsonPushstrCompat(rumor.content);
    }
  }

  return {
    inner: rumor || inner,
    outerInner: inner,
    msg: parsed.msg,
    parseMode: parsed.parseMode,
    rawContent: parsed.raw,
    verified,
    stage: stage.step,
  };
}

function classifyUnwrapError(err) {
  const m = String(err?.message || err || '').toLowerCase();
  if (m.includes('invalid payload length')) return 'invalid_payload_length';
  if (m.includes('invalid base64')) return 'invalid_base64';
  if (m.includes('unknown encryption version')) return 'unknown_encryption_version';
  if (m.includes('json.parse')) return 'json_parse';
  return 'other';
}

export function normalizeAdminKeyPayload(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (msg.type !== 'adminkey') return null;

  const streamId = msg.streamId ?? msg.stream ?? null;
  const frameId = Number(msg.frameId ?? msg.frame_id ?? msg.frame ?? NaN);
  const x = msg.x ?? msg.hash ?? msg.blob_hash ?? null;
  const k = msg.k ?? msg.key ?? null;
  const key_id = msg.key_id ?? msg.keyId ?? 'default';
  const m = msg.m ?? msg.mime ?? 'image/webp';
  const alg = msg.alg ?? (msg.enc === 'none' ? 'none' : 'aes-gcm');
  const enc = msg.enc ?? (alg === 'none' ? 'none' : 'nip44');

  if (typeof streamId !== 'string' || !streamId.trim()) return null;
  if (!Number.isFinite(frameId) || frameId <= 0) return null;
  if (typeof x !== 'string' || x.length < 8) return null;

  const isPlain = enc === 'none' || alg === 'none';
  if (!isPlain && (typeof k !== 'string' || k.length < 8)) return null;

  return {
    type: 'adminkey',
    streamId,
    frameId,
    x,
    ...(isPlain ? {} : { k }),
    key_id,
    m,
    alg,
    enc,
  };
}

export function unwrapDmJsonPushstrCompatAdmin({ recipientSk, wrapEv }) {
  try {
    const out = unwrapDmJsonPushstrCompat({ recipientSk, wrapEv });
    const normalized = normalizeAdminKeyPayload(out.msg);
    const msg = normalized || out.msg;
    return {
      ...out,
      msg,
      classifier: msg ? 'ok' : `drop:${out.parseMode}`,
      normalizedAdminKey: !!normalized,
    };
  } catch (e) {
    return {
      inner: null,
      msg: null,
      parseMode: 'unwrap_error',
      rawContent: '',
      classifier: `drop:${classifyUnwrapError(e)}`,
      error: e,
    };
  }
}
