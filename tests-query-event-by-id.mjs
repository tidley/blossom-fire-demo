const RELAY = process.env.RELAY_NIP17 || 'wss://nip17.tomdwyer.uk';
const ID = process.argv[2] || process.env.EVENT_ID;

if (!ID) {
  console.error('Usage: node tests-query-event-by-id.mjs <eventId>');
  process.exit(1);
}

const ws = new WebSocket(RELAY);

ws.onopen = () => {
  ws.send(JSON.stringify(['REQ', 'q', { ids: [ID], kinds: [1059], limit: 1 }]));
};

ws.onmessage = (m) => {
  const msg = JSON.parse(m.data.toString());
  if (msg[0] === 'EVENT') {
    console.log(JSON.stringify(msg[2], null, 2));
  }
  if (msg[0] === 'EOSE') {
    ws.close();
  }
};

ws.onerror = () => {
  console.error('websocket error');
  process.exit(1);
};
