import { readFileSync } from 'node:fs';
import {
  getPublicKey,
  nip17,
  nip59,
  nip19,
  finalizeEvent,
  nip42,
} from 'nostr-tools';

const RELAY = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TARGET_NPUB = process.env.TARGET_NPUB || 'npub1fu64hh9hes90w2808n8tjc2ajp5yhddjef0ctx4s7zmsgp6cwx4qgy4eg9';
const TARGET_STREAM = process.env.TARGET_STREAM || '';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);

function argValue(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

const CMD = argValue('--cmd', '2 on');
const RAW = process.argv.includes('--raw');

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function loadAdminSkHex() {
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

  throw new Error('ADMIN_SK_HEX not found in web/config.js (set SENDER_SK_HEX env)');
}

const gift = nip17 || nip59;
if (!gift?.wrapEvent) throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');

function now() { return Math.floor(Date.now() / 1000); }

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function wrapCompat(senderSk, recipientPub, payloadText) {
  const recipient = { publicKey: recipientPub, relays: [RELAY] };
  const rumor = finalizeEvent(
    { kind: 14, created_at: now(), tags: [], content: payloadText, pubkey: getPublicKey(senderSk) },
    senderSk
  );
  const skHex = bytesToHex(senderSk);

  // Mirror browser util.js compatibility strategy as closely as possible.
  const attempts = [
    // event-first variants
    () => gift.wrapEvent(rumor, senderSk, recipientPub),
    () => gift.wrapEvent(rumor, skHex, recipientPub),

    // sender-first variants
    () => gift.wrapEvent(senderSk, recipient, payloadText),
    () => gift.wrapEvent(skHex, recipient, payloadText),

    // older fallback signatures
    () => gift.wrapEvent(senderSk, recipientPub, payloadText),
    () => gift.wrapEvent(skHex, recipientPub, payloadText),
  ];

  let lastErr;
  for (const fn of attempts) {
    try { return fn(); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('nip17 wrap failed');
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

  const senderSkHex = loadAdminSkHex();
  const senderSk = hexToBytes(senderSkHex);
  const senderPub = getPublicKey(senderSk);

  const payloadText = String(CMD || '').trim();
  if (!payloadText) throw new Error('empty --cmd');

  // Default to JSON control payload for deterministic admin parsing.
  // --raw keeps plain-text mode for manual experiments.
  let finalContent = payloadText;
  if (!RAW) {
    const mSet = payloadText.match(/^(\d+)\s+(on|off)$/i);
    const mNum = payloadText.match(/^(\d+)$/);
    if (mSet) {
      finalContent = JSON.stringify({
        type: 'set_viewer',
        index: Number(mSet[1]),
        allowed: mSet[2].toLowerCase() === 'on',
      });
    } else if (mNum) {
      finalContent = JSON.stringify({
        type: 'toggle_viewer',
        index: Number(mNum[1]),
      });
    }
  }

  const wrap = wrapCompat(senderSk, recipientPub, finalContent);
  await wsPublish(RELAY, wrap, senderSk);

  console.log('PASS sent admin command DM', {
    relay: RELAY,
    from: senderPub,
    to: TARGET_NPUB,
    stream: TARGET_STREAM || '(not specified in plain cmd)',
    cmd: payloadText,
    sentContent: finalContent,
    mode: RAW ? 'raw' : 'json',
  });
}

main().catch((e) => {
  console.error('FAIL send admin command DM', e?.message || e);
  process.exit(1);
});
