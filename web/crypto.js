export async function aesGcmEncrypt(keyBytes32, plaintextBytes, { aadBytes } = {}) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes32,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const alg = { name: "AES-GCM", iv };
  if (aadBytes) alg.additionalData = aadBytes;
  const ctBuf = await crypto.subtle.encrypt(alg, key, plaintextBytes);
  return { iv, ciphertext: new Uint8Array(ctBuf) };
}

export async function aesGcmDecrypt(keyBytes32, ivBytes12, ciphertextBytes, { aadBytes } = {}) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes32,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const alg = { name: "AES-GCM", iv: ivBytes12 };
  if (aadBytes) alg.additionalData = aadBytes;
  const ptBuf = await crypto.subtle.decrypt(alg, key, ciphertextBytes);
  return new Uint8Array(ptBuf);
}

export function randKey32() {
  return crypto.getRandomValues(new Uint8Array(32));
}

// HKDF-SHA256 helper (WebCrypto)
export async function hkdfSha256(ikmBytes, { saltBytes = new Uint8Array([]), infoBytes = new Uint8Array([]), length = 32 } = {}) {
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    ikmBytes,
    "HKDF",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBytes,
      info: infoBytes,
    },
    ikmKey,
    length * 8
  );
  return new Uint8Array(bits);
}

// MLS plan: per-epoch exporter secret -> per-chunk key derivation.
// K_i = HKDF(ikm=epochKey, salt=streamId, info="chunk:"+i, len=32)
export async function deriveChunkKey(epochKey32, streamId, chunkId) {
  return hkdfSha256(epochKey32, {
    saltBytes: utf8Bytes(streamId),
    infoBytes: utf8Bytes(`chunk:${chunkId}`),
    length: 32,
  });
}

export function utf8Bytes(s) {
  return new TextEncoder().encode(s);
}

export async function sha256Bytes(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(buf);
}

export function b64encode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64decode(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
