import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  nip44,
} from "https://esm.sh/nostr-tools@2.10.2";

// Minimal hex helpers (avoid relying on nostr-tools named exports that vary by build)
export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

import { RELAYS } from "./config.js";

export const pool = new SimplePool();

export function getStreamId() {
  const u = new URL(location.href);
  return u.searchParams.get("stream") || "demo1";
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function npubFromPubkey(pubkeyHex) {
  return nip19.npubEncode(pubkeyHex);
}

export function getOrCreateViewerKeypair(storageKey = "demo.viewer.sk") {
  const existing = localStorage.getItem(storageKey);
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) {
    const sk = hexToBytes(existing);
    const pk = getPublicKey(sk);
    return { sk, pk, npub: npubFromPubkey(pk) };
  }
  const sk = generateSecretKey();
  const skHex = bytesToHex(sk);
  localStorage.setItem(storageKey, skHex);
  const pk = getPublicKey(sk);
  return { sk, pk, npub: npubFromPubkey(pk) };
}

export function skFromHex(hex) {
  return hexToBytes(hex);
}

export function pubkeyFromSk(skBytes) {
  return getPublicKey(skBytes);
}

export async function publish(event) {
  const pubs = pool.publish(RELAYS, event);
  // Best-effort; wait for at least one OK or timeout quickly
  await Promise.race([
    Promise.any(pubs.map((p) => p)),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]).catch(() => {});
}

export function sub(filters, onEvent) {
  // nostr-tools SimplePool APIs differ by version/build.
  // Prefer subscribeMany (v2), then sub (older builds).
  if (typeof pool.subscribeMany === "function") {
    // subscribeMany(relays, filters, handlers)
    const sub = pool.subscribeMany(RELAYS, filters, {
      onevent: onEvent,
    });
    return sub;
  }
  if (typeof pool.sub === "function") {
    const s = pool.sub(RELAYS, filters);
    s.on("event", onEvent);
    return s;
  }
  if (typeof pool.subscribe === "function") {
    const s = pool.subscribe(RELAYS, filters, {
      onevent: onEvent,
    });
    return s;
  }
  throw new Error("SimplePool: no subscribe method available");
}

export function makeSignedEventUnsigned(kind, sk, { content = "", tags = [] } = {}) {
  const ev = {
    kind,
    created_at: now(),
    tags,
    content,
    pubkey: pubkeyFromSk(sk),
  };
  return finalizeEvent(ev, sk);
}

export function nip44Encrypt(sk, recipientPubkeyHex, plaintext) {
  // nostr-tools nip44.encrypt expects (plaintext, conversationKey, [nonce])
  const conversationKey = nip44.getConversationKey(sk, recipientPubkeyHex);
  return nip44.encrypt(plaintext, conversationKey);
}

export function nip44Decrypt(sk, senderPubkeyHex, ciphertext) {
  const conversationKey = nip44.getConversationKey(sk, senderPubkeyHex);
  return nip44.decrypt(ciphertext, conversationKey);
}
