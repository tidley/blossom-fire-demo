// Dummy MLS group fallback.
//
// This mimics the interface of the real OpenMLS WASM-backed implementation,
// but just holds a static 32-byte secret (shared out-of-band) and a fake epoch.

import { randKey32, b64encode, b64decode } from './crypto.js';

export class DummyMlsAdmin {
  constructor(streamId) {
    this.streamId = streamId;
    this.epoch = 1;
    this.secret = randKey32();
  }

  static load(streamId, json) {
    const d = new DummyMlsAdmin(streamId);
    const o = JSON.parse(json);
    d.epoch = o.epoch || 1;
    d.secret = b64decode(o.secret);
    return d;
  }

  persist() {
    return JSON.stringify({ epoch: this.epoch, secret: b64encode(this.secret) });
  }

  group_epoch() { return this.epoch; }

  // In dummy mode, a "join request" is ignored and we just hand out the secret.
  add_member(_keyPackageB64) {
    const out = { welcome: b64encode(this.secret), commit: '', epoch: this.epoch };
    return JSON.stringify(out);
  }

  process_commit(_commitB64) { return this.epoch; }

  export_secret(_label, _contextB64, len) {
    if (len !== 32) throw new Error('dummy export_secret only supports 32 bytes');
    return b64encode(this.secret);
  }
}

export class DummyMlsMember {
  constructor(_identity) {
    this.epoch = 0;
    this.secret = null;
  }

  static load(_identity, json) {
    const m = new DummyMlsMember('');
    const o = JSON.parse(json);
    m.epoch = o.epoch || 0;
    m.secret = o.secret ? b64decode(o.secret) : null;
    return m;
  }

  persist() {
    return JSON.stringify({ epoch: this.epoch, secret: this.secret ? b64encode(this.secret) : null });
  }

  group_epoch() { return this.epoch; }

  create_key_package() {
    // meaningless in dummy mode
    return '';
  }

  process_welcome(welcomeB64, _commitB64) {
    this.secret = b64decode(welcomeB64);
    this.epoch = 1;
    return this.epoch;
  }

  process_commit(_commitB64) {
    return this.epoch;
  }

  export_secret(_label, _contextB64, len) {
    if (!this.secret) throw new Error('not joined');
    if (len !== 32) throw new Error('dummy export_secret only supports 32 bytes');
    return b64encode(this.secret);
  }
}
