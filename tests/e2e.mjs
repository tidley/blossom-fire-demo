#!/usr/bin/env node
// Minimal E2E checks for the Blossom Fire demo
// Usage:
//   RELAY=wss://relay.tomdwyer.uk BLOSSOM=https://blossom.tomdwyer.uk node tests/e2e.mjs

import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, nip17 } from "nostr-tools";

const RELAY = process.env.RELAY;
const BLOSSOM = process.env.BLOSSOM;
if (!RELAY) throw new Error("Set RELAY=ws(s)://...");
if (!BLOSSOM) throw new Error("Set BLOSSOM=http(s)://... (base URL) ");

const pool = new SimplePool();

function now() { return Math.floor(Date.now()/1000); }

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function blossomUpload(bytes) {
  const r = await fetch(`${BLOSSOM}/upload`, { method: 'POST', body: bytes });
  if (!r.ok) throw new Error(`blossom upload failed: ${r.status}`);
  return (await r.json()).hash;
}

async function blossomFetch(hash) {
  const r = await fetch(`${BLOSSOM}/blob/${hash}`);
  if (!r.ok) throw new Error(`blossom fetch failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function testBlossomRoundtrip() {
  const msg = new TextEncoder().encode(`hello-${Date.now()}`);
  const hash = await blossomUpload(msg);
  const got = await blossomFetch(hash);
  if (new TextDecoder().decode(got) !== new TextDecoder().decode(msg)) throw new Error('blossom roundtrip mismatch');
  console.log('OK blossom roundtrip', hash.slice(0,8)+'…');
}

async function testRelayPubSub() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tag = `demo-e2e-${Date.now()}`;

  const ev = finalizeEvent({
    kind: 1,
    created_at: now(),
    pubkey: pk,
    tags: [['t', tag]],
    content: 'e2e',
  }, sk);

  let seen = false;

  const sub = pool.subscribeMany([RELAY], [{ kinds:[1], '#t':[tag], limit: 5 }], {
    onevent: (e) => {
      if (e.id === ev.id) seen = true;
    }
  });

  const pubs = pool.publish([RELAY], ev);
  await Promise.race([
    Promise.any(pubs.map(p => p)),
    sleep(1500)
  ]).catch(()=>{});

  for (let i=0;i<20 && !seen;i++) await sleep(150);
  sub.close?.();

  if (!seen) throw new Error('relay pub/sub failed (did not observe published event)');
  console.log('OK relay pub/sub');
}

async function testNip17Roundtrip() {
  const aSk = generateSecretKey();
  const bSk = generateSecretKey();
  const bPk = getPublicKey(bSk);

  const pt = JSON.stringify({ hello: 'world', t: Date.now() });
  const wrap = nip17.wrapEvent(aSk, { publicKey: bPk, relays: [RELAY] }, pt);
  const inner = nip17.unwrapEvent(wrap, bSk);
  if (inner.content !== pt) throw new Error('nip17 unwrap mismatch');
  console.log('OK nip17 roundtrip');
}

async function main(){
  await testBlossomRoundtrip();
  await testRelayPubSub();
  await testNip17Roundtrip();
  await pool.close([RELAY]);
}

main().catch((e)=>{
  console.error('FAIL', e);
  process.exit(1);
});
