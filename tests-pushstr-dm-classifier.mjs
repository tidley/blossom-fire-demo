import assert from 'node:assert/strict';

function extractFirstJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function parseDmJsonPushstrCompat(rawContent) {
  const raw = String(rawContent || '').trim();
  if (!raw) return { msg: null, parseMode: 'empty', raw };
  try {
    return { msg: JSON.parse(raw), parseMode: 'strict', raw };
  } catch {}
  const candidate = extractFirstJsonObject(raw);
  if (candidate) {
    try {
      return { msg: JSON.parse(candidate), parseMode: 'extracted_object', raw };
    } catch {}
  }
  return { msg: null, parseMode: 'non_json', raw };
}

assert.equal(parseDmJsonPushstrCompat('{"type":"adminkey"}').parseMode, 'strict');
assert.equal(parseDmJsonPushstrCompat('noise {"type":"adminkey","streamId":"x"} tail').parseMode, 'extracted_object');
assert.equal(parseDmJsonPushstrCompat('AtHBiyv/YjVa+ESX+41V').parseMode, 'non_json');
assert.equal(parseDmJsonPushstrCompat('').parseMode, 'empty');

console.log('PASS tests-pushstr-dm-classifier (4 cases)');
