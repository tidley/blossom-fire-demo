import assert from 'node:assert/strict';

function parseDmJsonPushstrCompat(rawContent) {
  const raw = String(rawContent || '').trim();
  if (!raw) return { msg: null, parseMode: 'empty', raw };
  try { return { msg: JSON.parse(raw), parseMode: 'strict', raw }; } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return { msg: JSON.parse(raw.slice(start, end + 1)), parseMode: 'extracted_object', raw }; } catch {}
  }
  return { msg: null, parseMode: 'non_json', raw };
}

function parseRumorEventMaybe(rawContent) {
  const raw = String(rawContent || '').trim();
  if (!raw) return null;
  try {
    const maybe = JSON.parse(raw);
    if (maybe && typeof maybe === 'object' && Number.isFinite(maybe.kind) && typeof maybe.content === 'string') return maybe;
  } catch {}
  return null;
}

function simulateUnwrapInnerContent(innerContent) {
  let parsed = parseDmJsonPushstrCompat(innerContent);
  let mode = parsed.parseMode;
  const parsedLooksLikeRumorEvent = parsed.msg && typeof parsed.msg === 'object' && Number.isFinite(parsed.msg.kind) && typeof parsed.msg.content === 'string' && !parsed.msg.type;
  if (!parsed.msg || parsedLooksLikeRumorEvent) {
    const rumor = parsedLooksLikeRumorEvent ? parsed.msg : parseRumorEventMaybe(innerContent);
    if (rumor?.content) {
      parsed = parseDmJsonPushstrCompat(rumor.content);
      mode = `rumor:${parsed.parseMode}`;
    }
  }
  return { msg: parsed.msg, mode };
}

const direct = simulateUnwrapInnerContent('{"type":"adminkey","streamId":"s","frameId":1,"x":"abcdefghi","k":"YmFzZTY0a2V5"}');
assert.equal(direct.msg?.type, 'adminkey');
assert.equal(direct.mode, 'strict');

const rumorWrapped = simulateUnwrapInnerContent(JSON.stringify({ kind: 14, content: '{"type":"adminkey","streamId":"s","frameId":2,"x":"abcdefghi","k":"YmFzZTY0a2V5"}' }));
assert.equal(rumorWrapped.msg?.type, 'adminkey');
assert.equal(rumorWrapped.mode, 'rumor:strict');

const noise = simulateUnwrapInnerContent('AbCdEf12345==');
assert.equal(noise.msg, null);

console.log('PASS tests-pushstr-rumor-parse (3 cases)');
