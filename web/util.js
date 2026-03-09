import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  nip44,
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

export function nip44Encrypt(sk, recipientPubkeyHex, plaintext) {
  return nip44.encrypt(sk, recipientPubkeyHex, plaintext);
}

export function nip44Decrypt(sk, senderPubkeyHex, ciphertext) {
  return nip44.decrypt(sk, senderPubkeyHex, ciphertext);
}
