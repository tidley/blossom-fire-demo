import * as nostrTools from "https://esm.sh/nostr-tools@2.10.2";
import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "https://esm.sh/nostr-tools@2.10.2";

import { RELAYS } from "./config.js";

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

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
  // nostr-tools SimplePool APIs differ by build/version.
  if (typeof pool.subscribeMany === "function") {
    return pool.subscribeMany(RELAYS, filters, { onevent: onEvent });
  }
  if (typeof pool.sub === "function") {
    const s = pool.sub(RELAYS, filters);
    s.on("event", onEvent);
    return s;
  }
  if (typeof pool.subscribe === "function") {
    return pool.subscribe(RELAYS, filters, { onevent: onEvent });
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

// NIP-17 gift-wrap helpers
// nostr-tools builds may expose this as `nip17` or `nip59`.
const giftWrap = nostrTools.nip17 || nostrTools.nip59;

export function nip17WrapJson(senderSk, recipientPubkeyHex, payload) {
  if (!giftWrap?.wrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
  const recipient = { publicKey: recipientPubkeyHex, relays: RELAYS };
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return giftWrap.wrapEvent(senderSk, recipient, content);
}

export function nip17UnwrapJson(recipientSk, wrapEv) {
  if (!giftWrap?.unwrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
  const inner = giftWrap.unwrapEvent(wrapEv, recipientSk);
  let msg = null;
  try { msg = JSON.parse(inner.content || 'null'); } catch {}
  return { inner, msg };
}
