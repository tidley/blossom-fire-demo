import { b64decode, sha256Bytes, utf8Bytes } from './crypto.js';

// Derive a 32-byte per-chunk AES key from an MLS exporter secret.
//
// exporterSecretB64: base64 of 32 bytes.
// We keep this deterministic and domain-separated by streamId.
export async function deriveChunkKey(exporterSecretB64, streamId, chunkId) {
  const secret = b64decode(exporterSecretB64);
  const msg = utf8Bytes(`${streamId}:${chunkId}`);
  const buf = new Uint8Array(secret.length + msg.length);
  buf.set(secret, 0);
  buf.set(msg, secret.length);
  const out = await sha256Bytes(buf);
  return out; // 32 bytes
}
