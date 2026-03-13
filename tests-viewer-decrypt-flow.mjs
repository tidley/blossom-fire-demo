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

class SimViewer {
  constructor(streamId, blossom) {
    this.streamId = streamId;
    this.blossom = blossom;
    this.keys = new Map();          // frameId -> { keyId, keyB64, blobHash, mime, enc }
    this.keysById = new Map();      // keyId -> keyB64
    this.currentKeyB64 = null;      // legacy fallback
  }

  ingestViewerKey(msg) {
    const keyId = msg.key_id || 'default';
    if (msg.k) {
      this.currentKeyB64 = msg.k;
      this.keysById.set(keyId, msg.k);
    }
    this.keys.set(Number(msg.frameId), {
      keyId,
      keyB64: msg.k || this.keysById.get(keyId) || this.currentKeyB64,
      blobHash: msg.x,
      mime: msg.m || 'image/webp',
      enc: msg.enc || null,
    });
  }

  async decryptFrame(frameId, aadMode = 'canonical') {
    const k = this.keys.get(frameId);
    assert.ok(k, `missing viewerkey for frame ${frameId}`);
    const payload = this.blossom.get(k.blobHash);
    assert.ok(payload, `missing blob for frame ${frameId}`);

    if (k.enc === 'none') return payload;

    const resolvedKeyB64 = k.keyB64 || (k.keyId ? this.keysById.get(k.keyId) : null) || this.currentKeyB64;
    assert.ok(resolvedKeyB64, `missing key material for frame ${frameId}`);

    const { iv, ct } = unpack(payload);
    const keyBytes = b64decode(resolvedKeyB64);

    const aadCandidates = aadMode === 'fallback-scan'
      ? [utf8Bytes(`${this.streamId}:${frameId}`), utf8Bytes(String(frameId)), new Uint8Array(0)]
      : [utf8Bytes(`${this.streamId}:${frameId}`)];

    let lastErr;
    for (const aad of aadCandidates) {
      try {
        return await aesGcmDecrypt(keyBytes, iv, ct, { aadBytes: aad });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
}

async function encryptIntoBlossom(blossom, { key, plaintext, aadBytes }) {
  const { iv, ciphertext } = await aesGcmEncrypt(key, plaintext, { aadBytes });
  const payload = pack(iv, ciphertext);
  const hash = sha256Hex(payload);
  blossom.set(hash, payload);
  return hash;
}

async function testInitialAllowAndDecrypt() {
  const streamId = 'demo1';
  const blossom = new Map();
  const viewer = new SimViewer(streamId, blossom);

  const key = randKey32();
  const hash = await encryptIntoBlossom(blossom, {
    key,
    plaintext: utf8Bytes('hello-fire'),
    aadBytes: utf8Bytes(`${streamId}:1`),
  });

  viewer.ingestViewerKey({
    type: 'viewerkey',
    streamId,
    frameId: 1,
    x: hash,
    k: b64encode(key),
    key_id: 'k-1',
    alg: 'aes-gcm',
  });

  const out = await viewer.decryptFrame(1);
  assert.equal(Buffer.from(out).toString('utf8'), 'hello-fire');
}

async function testMetadataOnlyFollowupSameKey() {
  const streamId = 'demo1';
  const blossom = new Map();
  const viewer = new SimViewer(streamId, blossom);
  const key = randKey32();
  const keyB64 = b64encode(key);

  const h1 = await encryptIntoBlossom(blossom, {
    key,
    plaintext: utf8Bytes('chunk-1'),
    aadBytes: utf8Bytes(`${streamId}:1`),
  });
  const h2 = await encryptIntoBlossom(blossom, {
    key,
    plaintext: utf8Bytes('chunk-2'),
    aadBytes: utf8Bytes(`${streamId}:2`),
  });

  viewer.ingestViewerKey({ type: 'viewerkey', streamId, frameId: 1, x: h1, k: keyB64, key_id: 'k-static' });
  viewer.ingestViewerKey({ type: 'viewerkey', streamId, frameId: 2, x: h2, key_id: 'k-static' }); // no k

  assert.equal(Buffer.from(await viewer.decryptFrame(1)).toString('utf8'), 'chunk-1');
  assert.equal(Buffer.from(await viewer.decryptFrame(2)).toString('utf8'), 'chunk-2');
}

async function testKeyRotationWithMetadataOnlyMustUseKeyIdMap() {
  const streamId = 'demo1';
  const blossom = new Map();
  const viewer = new SimViewer(streamId, blossom);

  const keyOld = randKey32();
  const keyNew = randKey32();

  const h10 = await encryptIntoBlossom(blossom, {
    key: keyOld,
    plaintext: utf8Bytes('frame-10-oldkey'),
    aadBytes: utf8Bytes(`${streamId}:10`),
  });
  const h11 = await encryptIntoBlossom(blossom, {
    key: keyNew,
    plaintext: utf8Bytes('frame-11-newkey'),
    aadBytes: utf8Bytes(`${streamId}:11`),
  });
  const h12 = await encryptIntoBlossom(blossom, {
    key: keyNew,
    plaintext: utf8Bytes('frame-12-newkey-meta-only'),
    aadBytes: utf8Bytes(`${streamId}:12`),
  });

  // old key delivered
  viewer.ingestViewerKey({ type: 'viewerkey', streamId, frameId: 10, x: h10, k: b64encode(keyOld), key_id: 'k-old' });
  assert.equal(Buffer.from(await viewer.decryptFrame(10)).toString('utf8'), 'frame-10-oldkey');

  // rotate to new key (k provided once)
  viewer.ingestViewerKey({ type: 'viewerkey', streamId, frameId: 11, x: h11, k: b64encode(keyNew), key_id: 'k-new' });
  assert.equal(Buffer.from(await viewer.decryptFrame(11)).toString('utf8'), 'frame-11-newkey');

  // metadata-only frame with key_id k-new
  viewer.ingestViewerKey({ type: 'viewerkey', streamId, frameId: 12, x: h12, key_id: 'k-new' });
  assert.equal(Buffer.from(await viewer.decryptFrame(12)).toString('utf8'), 'frame-12-newkey-meta-only');
}

async function testPlainFramePathEncNone() {
  const streamId = 'demo1';
  const blossom = new Map();
  const viewer = new SimViewer(streamId, blossom);

  const payload = utf8Bytes('plain-image-bytes');
  const hash = sha256Hex(payload);
  blossom.set(hash, payload);

  viewer.ingestViewerKey({
    type: 'viewerkey',
    streamId,
    frameId: 20,
    x: hash,
    enc: 'none',
    alg: 'none',
    key_id: 'plain',
  });

  const out = await viewer.decryptFrame(20);
  assert.equal(Buffer.from(out).toString('utf8'), 'plain-image-bytes');
}

async function testAadFallbackCompatibility() {
  const streamId = 'demo1';
  const blossom = new Map();
  const viewer = new SimViewer(streamId, blossom);
  const key = randKey32();

  // Simulate legacy producer that used frameId-only AAD.
  const legacyAad = utf8Bytes('30');
  const hash = await encryptIntoBlossom(blossom, {
    key,
    plaintext: utf8Bytes('legacy-aad-frame'),
    aadBytes: legacyAad,
  });

  viewer.ingestViewerKey({ type: 'viewerkey', streamId, frameId: 30, x: hash, k: b64encode(key), key_id: 'k-legacy' });

  // Canonical-only should fail.
  let failed = false;
  try {
    await viewer.decryptFrame(30, 'canonical');
  } catch {
    failed = true;
  }
  assert.equal(failed, true, 'canonical-only decrypt should fail for legacy frameId-only AAD');

  // Fallback scan should recover.
  const out = await viewer.decryptFrame(30, 'fallback-scan');
  assert.equal(Buffer.from(out).toString('utf8'), 'legacy-aad-frame');
}

await testInitialAllowAndDecrypt();
await testMetadataOnlyFollowupSameKey();
await testKeyRotationWithMetadataOnlyMustUseKeyIdMap();
await testPlainFramePathEncNone();
await testAadFallbackCompatibility();

console.log('PASS tests-viewer-decrypt-flow (5 cases)');
