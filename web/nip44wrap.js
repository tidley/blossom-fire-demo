// Pure helpers for NIP-44 wrappers.
// Kept dependency-injected so it can be tested in Node (via `nostr-tools`) and
// used in the browser (via the esm.sh bundle).

export function nip44EncryptWith(nip44, sk, recipientPubkeyHex, plaintext) {
  if (!nip44?.getConversationKey || !nip44?.encrypt) throw new Error('invalid nip44 impl');
  const conversationKey = nip44.getConversationKey(sk, recipientPubkeyHex);
  return nip44.encrypt(plaintext, conversationKey);
}

export function nip44DecryptWith(nip44, sk, senderPubkeyHex, ciphertext) {
  if (!nip44?.getConversationKey || !nip44?.decrypt) throw new Error('invalid nip44 impl');
  const conversationKey = nip44.getConversationKey(sk, senderPubkeyHex);
  return nip44.decrypt(ciphertext, conversationKey);
}
