import {
  getPublicKey,
  nip19,
  nip17,
  nip59,
  finalizeEvent,
  nip42,
} from 'nostr-tools';

const RELAY_URL = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TARGET_NPUB = process.env.TARGET_NPUB || 'npub1fu64hh9hes90w2808n8tjc2ajp5yhddjef0ctx4s7zmsgp6cwx4qgy4eg9';
const TARGET_SK_HEX = process.env.TARGET_SK_HEX || ''; // optional, enables decrypt attempt + AUTH as target
const AUTH_SK_HEX = process.env.AUTH_SK_HEX || TARGET_SK_HEX || '1'.repeat(64); // relay auth identity for REQ
const SINCE_SEC = Number(process.env.SINCE_SEC || (Math.floor(Date.now() / 1000) - 3600));
const RUN_MS = Number(process.env.RUN_MS || 30000);

const gift = nip17 || nip59;

function hexToBytes(hex) {
  if (!hex) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function short(s) {
  if (!s) return s;
  return `${s.slice(0, 12)}…${s.slice(-8)}`;
}

async function wsReqAuthReceive(url, authSk, filter, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let subId = `s-${Date.now()}`;
    let authed = false;
    const sendReq = () => ws.send(JSON.stringify(['REQ', subId, filter]));

    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`recv timeout (${url})`));
    }, RUN_MS + 2000);

    ws.onopen = () => sendReq();
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }

      if (msg[0] === 'AUTH') {
        try {
          const unsigned = { ...nip42.makeAuthEvent(url, msg[1]), pubkey: getPublicKey(authSk) };
          const auth = finalizeEvent(unsigned, authSk);
          ws.send(JSON.stringify(['AUTH', auth]));
          authed = true;
          subId = `s-${Date.now()}-a`;
          setTimeout(() => { try { sendReq(); } catch {} }, 50);
        } catch (e) {
          clearTimeout(t);
          reject(new Error(`auth sign failed: ${e?.message || e}`));
        }
        return;
      }

      if (msg[0] === 'CLOSED' && authed) {
        if (String(msg[2] || '').includes('auth-required')) {
          subId = `s-${Date.now()}-r`;
          setTimeout(() => { try { sendReq(); } catch {} }, 50);
          return;
        }
      }

      if (msg[0] === 'EOSE' && msg[1] === subId) {
        // non-fatal: keep running for live arrivals
        return;
      }

      if (msg[0] === 'EVENT' && msg[1] === subId) {
        onEvent(msg[2]);
      }
    };

    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error(`websocket error recv ${url}`));
    };

    setTimeout(() => {
      clearTimeout(t);
      try { ws.send(JSON.stringify(['CLOSE', subId])); } catch {}
      try { ws.close(); } catch {}
      resolve();
    }, RUN_MS);
  });
}

async function main() {
  const decoded = nip19.decode(TARGET_NPUB);
  if (decoded.type !== 'npub') throw new Error('TARGET_NPUB must be npub');
  const targetPubHex = decoded.data;
  const targetSk = TARGET_SK_HEX ? hexToBytes(TARGET_SK_HEX.trim()) : null;
  const authSk = hexToBytes(AUTH_SK_HEX.trim());

  console.log('debug recv start', {
    relay: RELAY_URL,
    targetNpub: TARGET_NPUB,
    targetPubHex: short(targetPubHex),
    since: SINCE_SEC,
    decrypt: !!targetSk,
    authPub: short(getPublicKey(authSk)),
  });

  let count = 0;
  let decryptOk = 0;
  let decryptFail = 0;

  await wsReqAuthReceive(
    RELAY_URL,
    authSk,
    {
      kinds: [1059],
      '#p': [targetPubHex],
      since: SINCE_SEC,
      limit: 200,
    },
    (ev) => {
      count += 1;
      console.log('\nEVENT', {
        id: ev.id,
        created_at: ev.created_at,
        pubkey: short(ev.pubkey),
        kind: ev.kind,
        pTags: ev.tags.filter(t => t[0] === 'p').map(t => short(t[1])),
        contentLen: (ev.content || '').length,
      });

      if (targetSk && gift?.unwrapEvent) {
        try {
          const inner = gift.unwrapEvent(ev, targetSk);
          decryptOk += 1;
          console.log('UNWRAP_OK', {
            innerKind: inner.kind,
            innerPubkey: short(inner.pubkey),
            innerContent: (inner.content || '').slice(0, 220),
          });
        } catch (e) {
          decryptFail += 1;
          console.log('UNWRAP_FAIL', e?.message || String(e));
        }
      }
    }
  );

  console.log('\nSUMMARY', { count, decryptOk, decryptFail, runMs: RUN_MS });
}

main().catch((e) => {
  console.error('FAIL tests-debug-dm-recv', e?.message || e);
  process.exit(1);
});
