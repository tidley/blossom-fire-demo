import assert from 'node:assert/strict';
import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip17,
  nip59,
  nip42,
} from 'nostr-tools';

const DEMO_BASE = process.env.DEMO_BASE || 'https://demo.tomdwyer.uk';
const RELAY_PUBLIC = process.env.RELAY_PUBLIC || 'wss://relay.tomdwyer.uk';
const RELAY_NIP17 = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const STREAM = process.env.STREAM || 'demo1';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);

const TAG_REQ = 'blossom-fire-demo-req';
const TAG_DEMO = 'blossom-fire-demo';
const gift = nip17 || nip59;
if (!gift?.wrapEvent || !gift?.unwrapEvent) throw new Error('gift-wrap API unavailable');

function now() {
  return Math.floor(Date.now() / 1000);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function fetchPage(path, mustInclude) {
  const url = `${DEMO_BASE}${path}`;
  const r = await fetch(url);
  assert.equal(r.ok, true, `GET ${url} should be 200`);
  const text = await r.text();
  for (const token of mustInclude) {
    assert.equal(text.includes(token), true, `GET ${url} should include "${token}"`);
  }
}

async function wsPublish(url, event) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`publish timeout (${url})`));
    }, TIMEOUT_MS);

    ws.onopen = () => {
      ws.send(JSON.stringify(['EVENT', event]));
    };

    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (msg[0] === 'OK' && msg[1] === event.id) {
        clearTimeout(t);
        try { ws.close(); } catch {}
        if (msg[2] === true) resolve(true);
        else reject(new Error(`publish rejected: ${msg[3] || 'unknown'}`));
      }
      if (msg[0] === 'NOTICE') {
        // keep waiting for OK
      }
    };

    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error(`websocket error publishing to ${url}`));
    };
  });
}

async function wsReqAuthAndReceive(url, authSk, filter, validateEvent) {
  return new Promise((resolve, reject) => {
    const subId = `sub-${Date.now()}`;
    const relayUrl = url;
    const ws = new WebSocket(url);
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`auth req timeout (${url})`));
    }, TIMEOUT_MS);

    let authed = false;

    ws.onopen = () => {
      ws.send(JSON.stringify(['REQ', subId, filter]));
    };

    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }

      if (msg[0] === 'AUTH') {
        const challenge = msg[1];
        const unsigned = {
          ...nip42.makeAuthEvent(relayUrl, challenge),
          pubkey: getPublicKey(authSk),
        };
        const signed = finalizeEvent(unsigned, authSk);
        ws.send(JSON.stringify(['AUTH', signed]));
        authed = true;
        return;
      }

      if (msg[0] === 'OK') {
        // ignore; could be auth ack in some relays
        return;
      }

      if (msg[0] === 'EVENT' && msg[1] === subId) {
        const ev = msg[2];
        try {
          if (validateEvent(ev, { authed })) {
            clearTimeout(t);
            try { ws.send(JSON.stringify(['CLOSE', subId])); } catch {}
            try { ws.close(); } catch {}
            resolve(ev);
          }
        } catch {
          // ignore, keep listening
        }
      }

      if (msg[0] === 'NOTICE') {
        // keep waiting (use timeout to fail)
      }
    };

    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error(`websocket error on ${url}`));
    };
  });
}

async function testPages() {
  await fetchPage('/', ['Blossom Fire']);
  await fetchPage(`/admin.html?stream=${encodeURIComponent(STREAM)}`, ['Admin npub', 'Stream:']);
  await fetchPage(`/broadcast.html?stream=${encodeURIComponent(STREAM)}`, ['Broadcast']);
  await fetchPage(`/view.html?stream=${encodeURIComponent(STREAM)}`, ['Viewer']);
  await fetchPage(`/broadcast-video.html?stream=${encodeURIComponent(STREAM)}`, ['Broadcast', 'Chunk ms']);
  await fetchPage(`/view-video.html?stream=${encodeURIComponent(STREAM)}`, ['Viewer (near-live video)']);
  console.log('PASS pages');
}

async function testPublicAccessAndAnnouncements() {
  const pool = new SimplePool();
  const viewerSk = generateSecretKey();
  const viewerPub = getPublicKey(viewerSk);
  const marker = `req-${Date.now()}`;

  let gotReq = null;
  let gotAnn = null;

  const subReq = pool.subscribeMany(
    [RELAY_PUBLIC],
    [{ kinds: [1], '#t': [TAG_REQ], since: now() - 5, limit: 100 }],
    {
      onevent: (ev) => {
        const d = ev.tags.find((t) => t[0] === 'd')?.[1];
        if (ev.pubkey === viewerPub && d === STREAM && ev.content === marker) gotReq = ev;
      },
    }
  );

  const req = finalizeEvent({
    kind: 1,
    created_at: now(),
    tags: [['t', TAG_REQ], ['d', STREAM]],
    content: marker,
    pubkey: viewerPub,
  }, viewerSk);

  await Promise.race([
    Promise.any(pool.publish([RELAY_PUBLIC], req).map((p) => p)).catch(() => null),
    sleep(2000),
  ]);

  await waitFor(() => gotReq, TIMEOUT_MS, 'public access request visibility');

  const bcSk = generateSecretKey();
  const bcPub = getPublicKey(bcSk);
  const i = String(Date.now());
  const x = '0'.repeat(64);
  const ann = finalizeEvent({
    kind: 1,
    created_at: now(),
    tags: [['t', TAG_DEMO], ['d', STREAM], ['i', i], ['x', x], ['m', 'image/webp']],
    content: '',
    pubkey: bcPub,
  }, bcSk);

  const subAnn = pool.subscribeMany(
    [RELAY_PUBLIC],
    [{ kinds: [1], '#t': [TAG_DEMO], since: now() - 5, limit: 100 }],
    {
      onevent: (ev) => {
        const d = ev.tags.find((t) => t[0] === 'd')?.[1];
        const ii = ev.tags.find((t) => t[0] === 'i')?.[1];
        if (ev.pubkey === bcPub && d === STREAM && ii === i) gotAnn = ev;
      },
    }
  );

  await Promise.race([
    Promise.any(pool.publish([RELAY_PUBLIC], ann).map((p) => p)).catch(() => null),
    sleep(2000),
  ]);

  await waitFor(() => gotAnn, TIMEOUT_MS, 'public stream announcement visibility');

  subReq.close?.();
  subAnn.close?.();
  pool.close?.([RELAY_PUBLIC]);
  console.log('PASS public relay access request + announcement');
}

async function testNip17Carry() {
  const senderSk = generateSecretKey();
  const recipientSk = generateSecretKey();
  const recipientPub = getPublicKey(recipientSk);
  const marker = `nip17-${Date.now()}`;
  const payload = { type: 'adminkey', streamId: STREAM, frameId: 1, marker };

  const wrapped = gift.wrapEvent(senderSk, { publicKey: recipientPub, relays: [RELAY_NIP17] }, JSON.stringify(payload));
  assert.equal(wrapped.kind, 1059);

  await wsPublish(RELAY_NIP17, wrapped);

  const got = await wsReqAuthAndReceive(
    RELAY_NIP17,
    recipientSk,
    { kinds: [1059], '#p': [recipientPub], since: now() - 10, limit: 50 },
    (ev) => {
      try {
        const inner = gift.unwrapEvent(ev, recipientSk);
        const msg = JSON.parse(inner.content || '{}');
        return msg.marker === marker;
      } catch {
        return false;
      }
    }
  );

  const inner = gift.unwrapEvent(got, recipientSk);
  const msg = JSON.parse(inner.content || '{}');
  assert.equal(msg.marker, marker);
  assert.equal(msg.type, 'adminkey');

  console.log('PASS nip17 relay carry/receive/auth');
}

async function run() {
  console.log('Running Fire E2E suite', { DEMO_BASE, RELAY_PUBLIC, RELAY_NIP17, STREAM });
  await testPages();
  await testPublicAccessAndAnnouncements();
  await testNip17Carry();
  console.log('ALL PASS tests-e2e-fire');
}

run().catch((e) => {
  console.error('FAIL tests-e2e-fire:', e?.message || e);
  process.exit(1);
});
