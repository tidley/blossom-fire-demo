import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  randKey32,
  utf8Bytes,
  b64encode,
  b64decode,
} from './web/crypto.js';

function sha256Hex(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function pack(iv, ciphertext) {
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

function unpack(payload) {
  return { iv: payload.slice(0, 12), ct: payload.slice(12) };
}

async function testViewerCanDecryptAfterAllow() {
  const streamId = 'demo1';
  const frameId = 1;

  // Simulated Blossom store
  const blossom = new Map(); // hash -> payload bytes

  // Broadcaster encrypts and uploads blob
  const key = randKey32();
  const plaintext = utf8Bytes('hello-fire');
  const aad = utf8Bytes(`${streamId}:${frameId}`);
  const { iv, ciphertext } = await aesGcmEncrypt(key, plaintext, { aadBytes: aad });
  const payload = pack(iv, ciphertext);
  const hash = sha256Hex(payload);
  blossom.set(hash, payload);

  // Broadcaster -> admin (adminkey)
  const adminkey = {
    type: 'adminkey',
    streamId,
    frameId,
    x: hash,
    k: b64encode(key),
    key_id: 'k-1',
    m: 'video/webm',
    alg: 'aes-gcm',
    v: 1,
  };

  // Admin allows viewer and forwards viewerkey
  const viewerkey = {
    type: 'viewerkey',
    streamId,
    frameId: adminkey.frameId,
    x: adminkey.x,
    k: adminkey.k,
    key_id: adminkey.key_id,
    m: adminkey.m,
    alg: adminkey.alg,
    v: 1,
  };

  // Viewer receives viewerkey, fetches blob from Blossom, decrypts
  const fetched = blossom.get(viewerkey.x);
  assert.ok(fetched, 'viewer should be able to fetch encrypted blob from blossom');
  const { iv: iv2, ct } = unpack(fetched);
  const out = await aesGcmDecrypt(
    b64decode(viewerkey.k),
    iv2,
    ct,
    { aadBytes: utf8Bytes(`${viewerkey.streamId}:${viewerkey.frameId}`) }
  );
  assert.equal(Buffer.from(out).toString('utf8'), 'hello-fire');
}

async function testViewerCanDecryptFollowupChunkWithSameKeyMetadataOnly() {
  const streamId = 'demo1';
  const key = randKey32();
  const keyB64 = b64encode(key);
  const keyId = 'k-static';

  const blossom = new Map();

  // chunk 1
  const p1 = utf8Bytes('chunk-1');
  const aad1 = utf8Bytes(`${streamId}:1`);
  const e1 = await aesGcmEncrypt(key, p1, { aadBytes: aad1 });
  const payload1 = pack(e1.iv, e1.ciphertext);
  const h1 = sha256Hex(payload1);
  blossom.set(h1, payload1);

  // chunk 2 (same key)
  const p2 = utf8Bytes('chunk-2');
  const aad2 = utf8Bytes(`${streamId}:2`);
  const e2 = await aesGcmEncrypt(key, p2, { aadBytes: aad2 });
  const payload2 = pack(e2.iv, e2.ciphertext);
  const h2 = sha256Hex(payload2);
  blossom.set(h2, payload2);

  // viewer first gets full key, then metadata-only update
  let currentKeyB64 = null;

  const vk1 = { type: 'viewerkey', streamId, frameId: 1, x: h1, k: keyB64, key_id: keyId };
  if (vk1.k) currentKeyB64 = vk1.k;

  const vk2 = { type: 'viewerkey', streamId, frameId: 2, x: h2, key_id: keyId }; // no k

  const d1 = await aesGcmDecrypt(
    b64decode(currentKeyB64),
    unpack(blossom.get(vk1.x)).iv,
    unpack(blossom.get(vk1.x)).ct,
    { aadBytes: utf8Bytes(`${streamId}:1`) }
  );
  assert.equal(Buffer.from(d1).toString('utf8'), 'chunk-1');

  const d2 = await aesGcmDecrypt(
    b64decode(currentKeyB64),
    unpack(blossom.get(vk2.x)).iv,
    unpack(blossom.get(vk2.x)).ct,
    { aadBytes: utf8Bytes(`${streamId}:2`) }
  );
  assert.equal(Buffer.from(d2).toString('utf8'), 'chunk-2');
}

await testViewerCanDecryptAfterAllow();
await testViewerCanDecryptFollowupChunkWithSameKeyMetadataOnly();
console.log('PASS tests-viewer-decrypt-flow');
