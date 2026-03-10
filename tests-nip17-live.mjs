import assert from 'node:assert/strict';
import {
  generateSecretKey,
  getPublicKey,
  nip17,
  nip59,
  finalizeEvent,
  nip42,
} from 'nostr-tools';

const RELAY = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 12000);

const gift = nip17 || nip59;
if (!gift?.wrapEvent || !gift?.unwrapEvent) {
  throw new Error('nostr-tools gift-wrap API unavailable (nip17/nip59)');
}

function now() { return Math.floor(Date.now() / 1000); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function wrapCompat(senderSk, recipientPub, obj) {
  const content = JSON.stringify(obj);
  try {
    return gift.wrapEvent(senderSk, { publicKey: recipientPub, relays: [RELAY] }, content);
  } catch {
    const rumor = finalizeEvent(
      { kind: 14, created_at: now(), tags: [], content, pubkey: getPublicKey(senderSk) },
      senderSk
    );
    return gift.wrapEvent(rumor, senderSk, recipientPub);
  }
}

async function wsPublish(url, event) {
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

async function wsReqAuthReceive(url, sk, filter, match) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let subId = `s-${Date.now()}`;
    let authed = false;
    const sendReq = () => ws.send(JSON.stringify(['REQ', subId, filter]));

    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`recv timeout (${url})`));
    }, TIMEOUT_MS);

    ws.onopen = () => sendReq();
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }

      if (msg[0] === 'AUTH') {
        const unsigned = { ...nip42.makeAuthEvent(url, msg[1]), pubkey: getPublicKey(sk) };
        const auth = finalizeEvent(unsigned, sk);
        ws.send(JSON.stringify(['AUTH', auth]));
        authed = true;
        // Some relays close pre-auth REQ; send a fresh REQ after AUTH
        subId = `s-${Date.now()}-a`;
        setTimeout(() => { try { sendReq(); } catch {} }, 50);
        return;
      }

      if (msg[0] === 'CLOSED' && authed) {
        // Retry once post-auth with new sub id
        subId = `s-${Date.now()}-r`;
        setTimeout(() => { try { sendReq(); } catch {} }, 50);
        return;
      }

      if (msg[0] === 'EVENT' && msg[1] === subId) {
        const ev = msg[2];
        if (match(ev)) {
          clearTimeout(t);
          try { ws.send(JSON.stringify(['CLOSE', subId])); } catch {}
          try { ws.close(); } catch {}
          resolve(ev);
        }
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error(`websocket error recv ${url}`));
    };
  });
}

async function main() {
  const senderSk = generateSecretKey();
  const recipientSk = generateSecretKey();
  const recipientPub = getPublicKey(recipientSk);

  const marker = `live-${Date.now()}`;
  const payload = { type: 'live_smoke', marker, ts: now() };
  const wrap = wrapCompat(senderSk, recipientPub, payload);

  await wsPublish(RELAY, wrap);

  const ev = await wsReqAuthReceive(
    RELAY,
    recipientSk,
    { kinds: [1059], '#p': [recipientPub], since: now() - 14 * 24 * 3600, limit: 200 },
    (e) => {
      try {
        const inner = gift.unwrapEvent(e, recipientSk);
        const msg = JSON.parse(inner.content || '{}');
        return msg.marker === marker;
      } catch {
        return false;
      }
    }
  );

  const inner = gift.unwrapEvent(ev, recipientSk);
  const msg = JSON.parse(inner.content || '{}');
  assert.equal(msg.marker, marker);
  assert.equal(msg.type, 'live_smoke');
  console.log('PASS tests-nip17-live', { relay: RELAY, marker });
}

main().catch((e) => {
  console.error('FAIL tests-nip17-live', e?.message || e);
  process.exit(1);
});
