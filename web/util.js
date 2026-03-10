import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip17,
  nip19,
  bytesToHex,
  hexToBytes,
} from "https://esm.sh/nostr-tools@2.10.2";

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
  const s = pool.sub(RELAYS, filters);
  s.on("event", onEvent);
  return s;
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

// NIP-17 gift-wrap helpers
export function nip17WrapJson(senderSk, recipientPubkeyHex, payload) {
  const recipient = { publicKey: recipientPubkeyHex, relays: RELAYS };
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return nip17.wrapEvent(senderSk, recipient, content);
}

export function nip17UnwrapJson(recipientSk, wrapEv) {
  const inner = nip17.unwrapEvent(wrapEv, recipientSk);
  let msg = null;
  try { msg = JSON.parse(inner.content || 'null'); } catch {}
  return { inner, msg };
}
