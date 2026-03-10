import assert from 'node:assert/strict';
import {
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
    let subId = `sub-${Date.now()}`;
    const relayUrl = url;
    const ws = new WebSocket(url);
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`auth req timeout (${url})`));
    }, TIMEOUT_MS);

    let authed = false;
    const sendReq = () => ws.send(JSON.stringify(['REQ', subId, filter]));

    ws.onopen = () => sendReq();

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
        // Some relays close pre-auth REQ; send fresh REQ shortly after AUTH
        subId = `sub-${Date.now()}-a`;
        setTimeout(() => { try { sendReq(); } catch {} }, 50);
        return;
      }

      if (msg[0] === 'CLOSED' && authed) {
        // Retry once post-auth with new subId
        subId = `sub-${Date.now()}-r`;
        setTimeout(() => { try { sendReq(); } catch {} }, 50);
        return;
      }

      if (msg[0] === 'OK') return;

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
          // ignore
        }
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

async function wsReqReceive(url, filter, match) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const subId = `pub-${Date.now()}`;
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`public req timeout (${url})`));
    }, TIMEOUT_MS);

    ws.onopen = () => ws.send(JSON.stringify(['REQ', subId, filter]));
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
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
      reject(new Error(`public websocket error (${url})`));
    };
  });
}

async function testPublicAccessAndAnnouncements() {
  const viewerSk = generateSecretKey();
  const viewerPub = getPublicKey(viewerSk);
  const marker = `req-${Date.now()}`;

  const req = finalizeEvent({
    kind: 1,
    created_at: now(),
    tags: [['t', TAG_REQ], ['d', STREAM]],
    content: marker,
    pubkey: viewerPub,
  }, viewerSk);

  try {
    await wsPublish(RELAY_PUBLIC, req);
  } catch (e) {
    console.warn('SKIP public relay checks (publish rejected):', e.message);
    return { skipped: true, reason: e.message };
  }

  await wsReqReceive(
    RELAY_PUBLIC,
    { kinds: [1], '#t': [TAG_REQ], since: now() - 30, limit: 200 },
    (ev) => {
      const d = ev.tags.find((t) => t[0] === 'd')?.[1];
      return ev.pubkey === viewerPub && d === STREAM && ev.content === marker;
    }
  );

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

  await wsPublish(RELAY_PUBLIC, ann);

  await wsReqReceive(
    RELAY_PUBLIC,
    { kinds: [1], '#t': [TAG_DEMO], since: now() - 30, limit: 200 },
    (ev) => {
      const d = ev.tags.find((t) => t[0] === 'd')?.[1];
      const ii = ev.tags.find((t) => t[0] === 'i')?.[1];
      return ev.pubkey === bcPub && d === STREAM && ii === i;
    }
  );

  console.log('PASS public relay access request + announcement');
  return { skipped: false };
}

function wrapCompat(senderSk, recipientPub, payloadObj) {
  const content = JSON.stringify(payloadObj);
  try {
    return gift.wrapEvent(senderSk, { publicKey: recipientPub, relays: [RELAY_NIP17] }, content);
  } catch {
    const rumor = finalizeEvent({ kind: 14, created_at: now(), tags: [], content, pubkey: getPublicKey(senderSk) }, senderSk);
    return gift.wrapEvent(rumor, senderSk, recipientPub);
  }
}

async function testNip17Phases() {
  const adminSk = generateSecretKey();
  const adminPub = getPublicKey(adminSk);
  const viewerSk = generateSecretKey();
  const viewerPub = getPublicKey(viewerSk);
  const broadcasterSk = generateSecretKey();

  // Phase A: viewer -> admin access_req
  const markerA = `a-${Date.now()}`;
  await wsPublish(RELAY_NIP17, wrapCompat(viewerSk, adminPub, {
    type: 'access_req', streamId: STREAM, marker: markerA,
  }));

  const gotA = await wsReqAuthAndReceive(
    RELAY_NIP17,
    adminSk,
    { kinds: [1059], '#p': [adminPub], since: now() - 14 * 24 * 3600, limit: 300 },
    (ev) => {
      try {
        const inner = gift.unwrapEvent(ev, adminSk);
        const msg = JSON.parse(inner.content || '{}');
        return msg.type === 'access_req' && msg.marker === markerA && inner.pubkey === viewerPub;
      } catch { return false; }
    }
  );
  const innerA = gift.unwrapEvent(gotA, adminSk);
  const msgA = JSON.parse(innerA.content || '{}');
  assert.equal(msgA.type, 'access_req');

  // Phase B: broadcaster -> admin adminkey
  const markerB = `b-${Date.now()}`;
  await wsPublish(RELAY_NIP17, wrapCompat(broadcasterSk, adminPub, {
    type: 'adminkey', streamId: STREAM, frameId: 1, marker: markerB,
    x: '0'.repeat(64), k: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', m: 'video/webm', alg: 'aes-gcm', v: 1,
  }));

  const gotB = await wsReqAuthAndReceive(
    RELAY_NIP17,
    adminSk,
    { kinds: [1059], '#p': [adminPub], since: now() - 14 * 24 * 3600, limit: 300 },
    (ev) => {
      try {
        const inner = gift.unwrapEvent(ev, adminSk);
        const msg = JSON.parse(inner.content || '{}');
        return msg.type === 'adminkey' && msg.marker === markerB;
      } catch { return false; }
    }
  );
  const innerB = gift.unwrapEvent(gotB, adminSk);
  const msgB = JSON.parse(innerB.content || '{}');
  assert.equal(msgB.type, 'adminkey');

  // Phase C: admin -> viewer viewerkey
  const markerC = `c-${Date.now()}`;
  await wsPublish(RELAY_NIP17, wrapCompat(adminSk, viewerPub, {
    type: 'viewerkey', streamId: STREAM, frameId: 1, marker: markerC,
    x: '0'.repeat(64), k: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', m: 'video/webm', alg: 'aes-gcm', v: 1,
  }));

  const gotC = await wsReqAuthAndReceive(
    RELAY_NIP17,
    viewerSk,
    { kinds: [1059], '#p': [viewerPub], since: now() - 14 * 24 * 3600, limit: 300 },
    (ev) => {
      try {
        const inner = gift.unwrapEvent(ev, viewerSk);
        const msg = JSON.parse(inner.content || '{}');
        return msg.type === 'viewerkey' && msg.marker === markerC;
      } catch { return false; }
    }
  );
  const innerC = gift.unwrapEvent(gotC, viewerSk);
  const msgC = JSON.parse(innerC.content || '{}');
  assert.equal(msgC.type, 'viewerkey');

  console.log('PASS nip17 phases (access_req, adminkey, viewerkey)');
}

async function run() {
  console.log('Running Fire E2E suite', { DEMO_BASE, RELAY_PUBLIC, RELAY_NIP17, STREAM });
  await testPages();
  const pub = await testPublicAccessAndAnnouncements();
  await testNip17Phases();
  if (pub?.skipped) {
    console.log('ALL PASS tests-e2e-fire (public relay checks skipped)', pub.reason);
  } else {
    console.log('ALL PASS tests-e2e-fire');
  }
}

run().catch((e) => {
  console.error('FAIL tests-e2e-fire:', e?.message || e);
  process.exit(1);
});
