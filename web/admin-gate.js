// Pure helpers for admin access gating / key forwarding.

/**
 * @param {Map<string,{allowed:boolean}>|Array<[string,{allowed:boolean}]>} viewers
 * @param {{streamId:string, frameId:number|string, blobHash:string, keyB64:string, mime?:string, codec?:string, alg?:string, v?:number}} keyMsg
 * @returns {{viewerPub:string, payload:string}[]}
 */
export function computeForwardKeyPayloads(viewers, keyMsg) {
  const entries = Array.isArray(viewers) ? viewers : Array.from(viewers?.entries?.() || []);
  const {
    streamId,
    frameId,
    blobHash,
    keyB64,
    mime = 'application/octet-stream',
    codec,
    alg = 'aes-gcm',
    v = 1,
  } = keyMsg || {};

  if (!streamId) throw new Error('streamId required');
  if (frameId === undefined || frameId === null) throw new Error('frameId required');
  if (!blobHash) throw new Error('blobHash required');
  if (!keyB64) throw new Error('keyB64 required');

  const out = [];
  for (const [viewerPub, rec] of entries) {
    if (!rec?.allowed) continue;
    const payload = JSON.stringify({
      streamId,
      frameId: Number(frameId),
      x: blobHash,
      k: keyB64,
      m: mime,
      c: codec,
      alg,
      v,
    });
    out.push({ viewerPub, payload });
  }
  return out;
}
