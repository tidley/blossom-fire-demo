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

async function encryptFrame({ streamId, frameId, key, plaintext }) {
  const aad = utf8Bytes(`${streamId}:${frameId}`);
  const { iv, ciphertext } = await aesGcmEncrypt(key, plaintext, { aadBytes: aad });
  const payload = pack(iv, ciphertext);
  return { payload, hash: sha256Hex(payload) };
}

function mkViewerResolver(streamId) {
  const keysById = new Map();
  let currentKeyB64 = null;

  return {
    ingest(msg) {
      const keyId = msg.key_id || 'default';
      if (msg.k) {
        currentKeyB64 = msg.k;
        keysById.set(keyId, msg.k);
      }
      return {
        keyId,
        keyB64: msg.k || keysById.get(keyId) || currentKeyB64,
        x: msg.x,
      };
    },
    async decrypt(frameId, payload, keyB64) {
      assert.ok(keyB64, `missing key for frame ${frameId}`);
      const { iv, ct } = unpack(payload);
      return aesGcmDecrypt(b64decode(keyB64), iv, ct, { aadBytes: utf8Bytes(`${streamId}:${frameId}`) });
    },
  };
}

async function testRegression_oldBehaviorWouldFailAfterFrame1() {
  const streamId = 'regress';
  const blossom = new Map();

  // Broadcaster rotates key every frame.
  const k1 = randKey32();
  const k2 = randKey32();
  const f1 = await encryptFrame({ streamId, frameId: 1, key: k1, plaintext: utf8Bytes('f1') });
  const f2 = await encryptFrame({ streamId, frameId: 2, key: k2, plaintext: utf8Bytes('f2') });
  blossom.set(f1.hash, f1.payload);
  blossom.set(f2.hash, f2.payload);

  // OLD bug shape: admin forwarded msg.k only once (because key_id looked unchanged/default),
  // then metadata-only frame 2 despite key actually changing.
  const viewer = mkViewerResolver(streamId);
  const vk1 = viewer.ingest({ type: 'viewerkey', frameId: 1, x: f1.hash, k: b64encode(k1), key_id: 'default' });
  const vk2 = viewer.ingest({ type: 'viewerkey', frameId: 2, x: f2.hash, key_id: 'default' });

  const d1 = await viewer.decrypt(1, blossom.get(vk1.x), vk1.keyB64);
  assert.equal(Buffer.from(d1).toString('utf8'), 'f1');

  let failed = false;
  try {
    await viewer.decrypt(2, blossom.get(vk2.x), vk2.keyB64);
  } catch {
    failed = true;
  }
  assert.equal(failed, true, 'old forwarding behavior should fail on frame2 decrypt');
}

async function testFixedBehavior_perFrameKeyIdWorks() {
  const streamId = 'fixed';
  const blossom = new Map();

  const k1 = randKey32();
  const k2 = randKey32();
  const f1 = await encryptFrame({ streamId, frameId: 1, key: k1, plaintext: utf8Bytes('ok1') });
  const f2 = await encryptFrame({ streamId, frameId: 2, key: k2, plaintext: utf8Bytes('ok2') });
  blossom.set(f1.hash, f1.payload);
  blossom.set(f2.hash, f2.payload);

  // FIXED path: broadcaster sends key_id=frame-${id}; admin forwards new key when key_id changes.
  const viewer = mkViewerResolver(streamId);
  const vk1 = viewer.ingest({ type: 'viewerkey', frameId: 1, x: f1.hash, k: b64encode(k1), key_id: 'frame-1' });
  const vk2 = viewer.ingest({ type: 'viewerkey', frameId: 2, x: f2.hash, k: b64encode(k2), key_id: 'frame-2' });

  const d1 = await viewer.decrypt(1, blossom.get(vk1.x), vk1.keyB64);
  const d2 = await viewer.decrypt(2, blossom.get(vk2.x), vk2.keyB64);
  assert.equal(Buffer.from(d1).toString('utf8'), 'ok1');
  assert.equal(Buffer.from(d2).toString('utf8'), 'ok2');
}

async function testFixedBehavior_metadataOnlyStillWorksWhenKeyIdStable() {
  const streamId = 'stable';
  const blossom = new Map();

  const k = randKey32();
  const f1 = await encryptFrame({ streamId, frameId: 1, key: k, plaintext: utf8Bytes('same1') });
  const f2 = await encryptFrame({ streamId, frameId: 2, key: k, plaintext: utf8Bytes('same2') });
  blossom.set(f1.hash, f1.payload);
  blossom.set(f2.hash, f2.payload);

  const viewer = mkViewerResolver(streamId);
  const vk1 = viewer.ingest({ type: 'viewerkey', frameId: 1, x: f1.hash, k: b64encode(k), key_id: 'k-static' });
  const vk2 = viewer.ingest({ type: 'viewerkey', frameId: 2, x: f2.hash, key_id: 'k-static' });

  const d1 = await viewer.decrypt(1, blossom.get(vk1.x), vk1.keyB64);
  const d2 = await viewer.decrypt(2, blossom.get(vk2.x), vk2.keyB64);
  assert.equal(Buffer.from(d1).toString('utf8'), 'same1');
  assert.equal(Buffer.from(d2).toString('utf8'), 'same2');
}

await testRegression_oldBehaviorWouldFailAfterFrame1();
await testFixedBehavior_perFrameKeyIdWorks();
await testFixedBehavior_metadataOnlyStillWorksWhenKeyIdStable();

console.log('PASS tests-frame-key-forwarding-regression (3 cases)');
