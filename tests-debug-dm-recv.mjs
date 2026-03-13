import {
  Relay,
  nip19,
  nip17,
  nip59,
} from 'nostr-tools';

const RELAY_URL = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const TARGET_NPUB = process.env.TARGET_NPUB || 'npub1fu64hh9hes90w2808n8tjc2ajp5yhddjef0ctx4s7zmsgp6cwx4qgy4eg9';
const TARGET_SK_HEX = process.env.TARGET_SK_HEX || ''; // optional, enables decrypt attempt
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

async function main() {
  const decoded = nip19.decode(TARGET_NPUB);
  if (decoded.type !== 'npub') throw new Error('TARGET_NPUB must be npub');
  const targetPubHex = decoded.data;
  const targetSk = TARGET_SK_HEX ? hexToBytes(TARGET_SK_HEX.trim()) : null;

  console.log('debug recv start', {
    relay: RELAY_URL,
    targetNpub: TARGET_NPUB,
    targetPubHex: short(targetPubHex),
    since: SINCE_SEC,
    decrypt: !!targetSk,
  });

  const relay = await Relay.connect(RELAY_URL);

  let count = 0;
  let decryptOk = 0;
  let decryptFail = 0;

  const sub = relay.subscribe([
    {
      kinds: [1059],
      '#p': [targetPubHex],
      since: SINCE_SEC,
      limit: 200,
    },
  ], {
    onevent(ev) {
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
    },
    oneose() {
      console.log('EOSE reached');
    },
    onclose(reason) {
      console.log('SUB_CLOSED', reason || '(no reason)');
    },
  });

  await new Promise((r) => setTimeout(r, RUN_MS));
  try { sub.close(); } catch {}
  try { relay.close(); } catch {}

  console.log('\nSUMMARY', { count, decryptOk, decryptFail, runMs: RUN_MS });
}

main().catch((e) => {
  console.error('FAIL tests-debug-dm-recv', e?.message || e);
  process.exit(1);
});
