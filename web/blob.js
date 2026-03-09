import { BLOB_BASE } from "./config.js";

export async function blobUpload(bytes) {
  const r = await fetch(`${BLOB_BASE}/upload`, {
    method: "POST",
    body: bytes,
  });
  if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  const j = await r.json();
  return j.hash;
}

export async function blobFetch(hash) {
  const r = await fetch(`${BLOB_BASE}/blob/${hash}`);
  if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}
