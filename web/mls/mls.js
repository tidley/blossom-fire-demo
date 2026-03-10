// MLS group state interface + dummy implementation.
//
// Real MLS is expected to come from a Rust implementation compiled to WASM.
// This file provides stable APIs for the rest of the demo while MLS is WIP.
//
// Rust/WASM integration plan (TODO):
// - Use an MLS library like openmls (Rust).
// - Build a small wasm-bindgen wrapper exposing:
//   - create_group(stream_id) -> { state_bytes, welcome_bytes? }
//   - add_member(state_bytes, key_package) -> { new_state_bytes, welcome_bytes, commit_bytes }
//   - remove_member(state_bytes, member) -> { new_state_bytes, commit_bytes }
//   - process_welcome(welcome_bytes) -> state_bytes
//   - process_commit(state_bytes, commit_bytes) -> new_state_bytes
//   - exporter(state_bytes, label, context, len) -> bytes
// - Persist `state_bytes` in IndexedDB per stream.

import { randKey32, b64encode, b64decode } from '../crypto.js';

export class MlsGroup {
  // eslint-disable-next-line no-unused-vars
  static async createGroup({ streamId }) { throw new Error('not implemented'); }
  // eslint-disable-next-line no-unused-vars
  async processWelcome(_welcomeBytes) { throw new Error('not implemented'); }
  // eslint-disable-next-line no-unused-vars
  async processCommit(_commitBytes) { throw new Error('not implemented'); }
  async exportEpochKey(_streamId) { throw new Error('not implemented'); }
}

// Dummy group: stores a single epoch key in localStorage.
// This allows us to wire up the *key derivation* path without depending on MLS yet.
export class DummyMlsGroup extends MlsGroup {
  constructor({ streamId, storagePrefix = 'mls.dummy.' }) {
    super();
    this.streamId = streamId;
    this.storageKey = `${storagePrefix}epochKey.${streamId}`;
  }

  static async openOrCreate({ streamId }) {
    const g = new DummyMlsGroup({ streamId });
    // ensure exists
    await g.exportEpochKey(streamId);
    return g;
  }

  async processWelcome(_welcomeBytes) {
    // In a real MLS viewer, welcome installs group state and sets epoch.
    // For dummy mode, we do nothing.
    return;
  }

  async processCommit(_commitBytes) {
    // In real MLS, commit rotates epoch secrets.
    // For dummy mode, just rotate to a fresh random key.
    const k = randKey32();
    localStorage.setItem(this.storageKey, b64encode(k));
  }

  async exportEpochKey(_streamId) {
    const existing = localStorage.getItem(this.storageKey);
    if (existing) return b64decode(existing);
    const k = randKey32();
    localStorage.setItem(this.storageKey, b64encode(k));
    return k;
  }
}
