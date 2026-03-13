import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Make browser-oriented config.js resolvable in Node.
globalThis.location = { protocol: 'https:', hostname: 'demo.tomdwyer.uk' };

const { blobUpload, blobFetch } = await import('./web/blob.js');
const {
  aesGcmEncrypt,
  aesGcmDecrypt,
  randKey32,
  utf8Bytes,
  b64encode,
  b64decode,
} = await import('./web/crypto.js');

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

async function phase1_broadcaster_push_to_blossom() {
  const streamId = 'phase1';
  const frameId = 1;
  const plaintext = utf8Bytes(`fire-media-${Date.now()}`);
  const key = randKey32();

  const aad = utf8Bytes(`${streamId}:${frameId}`);
  const { iv, ciphertext } = await aesGcmEncrypt(key, plaintext, { aadBytes: aad });
  const payload = pack(iv, ciphertext);

  const expectedHash = sha256Hex(payload);
  const uploadedHash = await blobUpload(payload);

  assert.equal(uploadedHash, expectedHash, 'uploaded hash should match payload digest');

  const fetched = await blobFetch(uploadedHash);
  assert.equal(fetched.length, payload.length, 'fetched payload size should match uploaded payload');
  assert.equal(sha256Hex(fetched), expectedHash, 'fetched payload hash should match uploaded payload hash');

  console.log('PASS phase1 broadcaster->blossom', { uploadedHash, size: payload.length });
  return { streamId, frameId, key, keyB64: b64encode(key), hash: uploadedHash, plaintext };
}

async function phase2_admin_download_and_decrypt(seed) {
  const fetched = await blobFetch(seed.hash);
  const { iv, ct } = unpack(fetched);

  const aad = utf8Bytes(`${seed.streamId}:${seed.frameId}`);
  const out = await aesGcmDecrypt(seed.key, iv, ct, { aadBytes: aad });

  assert.equal(Buffer.from(out).toString('utf8'), Buffer.from(seed.plaintext).toString('utf8'));
  console.log('PASS phase2 admin decrypt', { hash: seed.hash });
}

async function phase3_authorized_viewer_unlocks(seed) {
  // what admin forwards to viewer in current app flow
  const viewerkey = {
    type: 'viewerkey',
    streamId: seed.streamId,
    frameId: seed.frameId,
    x: seed.hash,
    k: seed.keyB64,
    key_id: 'k-test',
    m: 'video/webm',
    alg: 'aes-gcm',
    v: 1,
  };

  const fetched = await blobFetch(viewerkey.x);
  const { iv, ct } = unpack(fetched);
  const aad = utf8Bytes(`${viewerkey.streamId}:${viewerkey.frameId}`);

  const out = await aesGcmDecrypt(b64decode(viewerkey.k), iv, ct, { aadBytes: aad });
  assert.equal(Buffer.from(out).toString('utf8'), Buffer.from(seed.plaintext).toString('utf8'));

  // negative check: unauthorized/wrong key should fail
  let unauthorizedFailed = false;
  try {
    await aesGcmDecrypt(randKey32(), iv, ct, { aadBytes: aad });
  } catch {
    unauthorizedFailed = true;
  }
  assert.equal(unauthorizedFailed, true, 'wrong key must fail decryption');

  console.log('PASS phase3 viewer unlock', { hash: viewerkey.x, key_id: viewerkey.key_id });
}

async function main() {
  console.log('Running media pipeline test against configured BLOB_BASE from web/config.js');
  const seed = await phase1_broadcaster_push_to_blossom();
  await phase2_admin_download_and_decrypt(seed);
  await phase3_authorized_viewer_unlocks(seed);
  console.log('ALL PASS tests-media-pipeline');
}

main().catch((e) => {
  console.error('FAIL tests-media-pipeline', e?.message || e);
  process.exit(1);
});
