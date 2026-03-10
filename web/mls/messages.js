// Runtime helpers for MLS/NIP-17 control-plane messages.
//
// Kept intentionally lightweight (no schema lib) to avoid build tooling.
// See docs/messages.md for the canonical schema.

function isObj(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

export function assertMsgBase(m) {
  if (!isObj(m)) throw new Error('msg must be object');
  if (typeof m.type !== 'string') throw new Error('msg.type must be string');
  if (typeof m.v !== 'number') throw new Error('msg.v must be number');
  if (typeof m.streamId !== 'string') throw new Error('msg.streamId must be string');
}

export function encodeMsg(m) {
  assertMsgBase(m);
  return JSON.stringify(m);
}

export function decodeMsg(json) {
  const m = JSON.parse(json);
  assertMsgBase(m);
  return m;
}

export function isJoinRequest(m) {
  return isObj(m) && m.type === 'join-request' && m.v === 1;
}

export function isWelcome(m) {
  return isObj(m) && m.type === 'welcome' && m.v === 1;
}

export function isCommit(m) {
  return isObj(m) && m.type === 'commit' && m.v === 1;
}

export function isChunkAnnouncement(m) {
  return isObj(m) && m.type === 'chunk-announcement' && m.v === 1;
}
