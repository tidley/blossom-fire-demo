// MSE append queue helpers (pure-ish) shared by video viewer + admin preview.

export function chooseNextChunkId(decryptedMap, lastAppended) {
  let next = null;
  for (const k of decryptedMap.keys()) {
    if (k > lastAppended && (next === null || k < next)) next = k;
  }
  return next;
}

export function pruneDecrypted(decryptedMap, lastAppended, { max = 80, keepBehind = 60 } = {}) {
  if (decryptedMap.size <= max) return;
  const delBelow = lastAppended - keepBehind;
  for (const k of decryptedMap.keys()) {
    if (k < delBelow) decryptedMap.delete(k);
  }
}

/**
 * Create a pump function that appends the next available chunk when possible.
 *
 * @param {object} opts
 * @param {{updating:boolean, appendBuffer:(buf:ArrayBuffer)=>void}} opts.sourceBuffer
 * @param {Map<number,Uint8Array>} opts.decrypted
 * @param {() => number} opts.getLastAppended
 * @param {(n:number)=>void} opts.setLastAppended
 * @param {(msg:string)=>void} [opts.onStatus]
 */
export function createPump(opts) {
  const { sourceBuffer, decrypted, getLastAppended, setLastAppended, onStatus } = opts;
  if (!sourceBuffer || !decrypted || !getLastAppended || !setLastAppended) {
    throw new Error('createPump: missing args');
  }

  return function pump() {
    if (sourceBuffer.updating) return;

    const last = getLastAppended();
    const next = chooseNextChunkId(decrypted, last);
    if (next === null) return;
    const bytes = decrypted.get(next);
    if (!bytes) return;

    try {
      sourceBuffer.appendBuffer(bytes.buffer);
      setLastAppended(next);
      pruneDecrypted(decrypted, next);
    } catch (e) {
      onStatus?.(`append error: ${e?.name || 'Error'}: ${e?.message || e}`);
    }
  };
}
