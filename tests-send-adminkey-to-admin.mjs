import { readFileSync } from 'node:fs';
import * as nt from 'nostr-tools';
import { wrapNip17Event } from './scripts/nip17-wrap.mjs';

const { getPublicKey, nip19, finalizeEvent, nip42 } = nt;

const RELAY = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TARGET_NPUB = process.env.TARGET_NPUB || 'npub1fu64hh9hes90w2808n8tjc2ajp5yhddjef0ctx4s7zmsgp6cwx4qgy4eg9';
const STREAM_ID = process.env.STREAM_ID || 'demo1';
const FRAME_ID = Number(process.env.FRAME_ID || 999);
const BLOB_HASH = process.env.BLOB_HASH || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KEY_ID = process.env.KEY_ID || `manual-${Date.now()}`;
const KEY_B64 = process.env.KEY_B64 || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function loadSenderSkHex() {
  if (process.env.SENDER_SK_HEX) return process.env.SENDER_SK_HEX.trim();
  const txt = readFileSync(new URL('./web/config.js', import.meta.url), 'utf8');

  const mLiteral = txt.match(/export const ADMIN_SK_HEX\s*=\s*"([0-9a-fA-F]{64})"/);
  if (mLiteral) return mLiteral[1];

  const mRepeat = txt.match(/export const ADMIN_SK_HEX\s*=\s*"([0-9a-fA-F])"\.repeat\((\d+)\)/);
  if (mRepeat) {
    const ch = mRepeat[1];
    const n = Number(mRepeat[2]);
    if (n === 64) return ch.repeat(64);
  }

  throw new Error('SENDER_SK_HEX missing and ADMIN_SK_HEX not parseable');
}

async function wsPublish(url, event, senderSk) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`publish timeout (${url})`));
    }, TIMEOUT_MS);

    ws.onopen = () => ws.send(JSON.stringify(['EVENT', event]));
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }

      if (msg[0] === 'AUTH') {
        try {
          const unsigned = { ...nip42.makeAuthEvent(url, msg[1]), pubkey: getPublicKey(senderSk) };
          const auth = finalizeEvent(unsigned, senderSk);
          ws.send(JSON.stringify(['AUTH', auth]));
        } catch {}
        return;
      }

      if (msg[0] === 'OK' && msg[1] === event.id) {
        clearTimeout(t);
        try { ws.close(); } catch {}
        if (msg[2] === true) resolve(true);
        else reject(new Error(`publish rejected: ${msg[3] || 'unknown'}`));
      }
    };

    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error(`websocket error publish ${url}`));
    };
  });
}

async function main() {
  const decoded = nip19.decode(TARGET_NPUB);
  if (decoded.type !== 'npub') throw new Error('TARGET_NPUB is not npub');
  const recipientPub = decoded.data;

  const senderSkHex = loadSenderSkHex();
  const senderSk = hexToBytes(senderSkHex);
  const senderPub = getPublicKey(senderSk);

  const payload = {
    type: 'adminkey',
    streamId: STREAM_ID,
    frameId: FRAME_ID,
    x: BLOB_HASH,
    k: KEY_B64,
    key_id: KEY_ID,
    m: 'image/webp',
    alg: 'aes-gcm',
    v: 1,
  };

  const { event: wrap, method } = wrapNip17Event({
    senderSk,
    recipientPubHex: recipientPub,
    relay: RELAY,
    content: JSON.stringify(payload),
  });

  await wsPublish(RELAY, wrap, senderSk);

  console.log('PASS sent adminkey DM', {
    eventId: wrap.id,
    wrapMethod: method,
    relay: RELAY,
    from: senderPub,
    to: TARGET_NPUB,
    payload,
  });
}

main().catch((e) => {
  console.error('FAIL send adminkey DM', e?.message || e);
  process.exit(1);
});
