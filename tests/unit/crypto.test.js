import { describe, it, expect } from 'vitest';
import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  randKey32,
  utf8Bytes,
  sha256Bytes,
  b64encode,
  b64decode,
} from '../../web/crypto.js';

describe('crypto helpers', () => {
  it('sha256Bytes returns 32 bytes', async () => {
    const h = await sha256Bytes(utf8Bytes('hello'));
    expect(h).toBeInstanceOf(Uint8Array);
    expect(h.length).toBe(32);
  });

  it('AES-GCM encrypt/decrypt roundtrip with 32-byte AAD', async () => {
    const key = randKey32();
    const pt = utf8Bytes(`pt-${Date.now()}`);
    const aad = await sha256Bytes(utf8Bytes('stream:123'));
    expect(aad.length).toBe(32);

    const { iv, ciphertext } = await aesGcmEncrypt(key, pt, { aadBytes: aad });
    const dec = await aesGcmDecrypt(key, iv, ciphertext, { aadBytes: aad });
    expect(new TextDecoder().decode(dec)).toBe(new TextDecoder().decode(pt));
  });

  it('AES-GCM decrypt fails with wrong AAD', async () => {
    const key = randKey32();
    const pt = utf8Bytes('secret');
    const aad1 = await sha256Bytes(utf8Bytes('aad-1'));
    const aad2 = await sha256Bytes(utf8Bytes('aad-2'));

    const { iv, ciphertext } = await aesGcmEncrypt(key, pt, { aadBytes: aad1 });
    await expect(aesGcmDecrypt(key, iv, ciphertext, { aadBytes: aad2 })).rejects.toThrow();
  });

  it('b64encode/b64decode roundtrip', async () => {
    const bytes = randKey32();
    const s = b64encode(bytes);
    const dec = b64decode(s);
    expect(dec).toEqual(bytes);
  });
});
