// MLS facade used by admin/broadcast/view.
//
// Tries to load the real OpenMLS WASM package (built via wasm-pack into
// web/pkg_mls). If unavailable, falls back to DummyMls*.

import { DummyMlsAdmin, DummyMlsMember } from './mls_dummy.js';

async function loadReal() {
  try {
    // wasm-pack --target web emits JS that does top-level await to init.
    // Dynamic import works in modern browsers.
    const mod = await import('./pkg_mls/mls_wasm.js');
    return { MlsAdmin: mod.MlsAdmin, MlsMember: mod.MlsMember, kind: 'openmls' };
  } catch (e) {
    console.warn('MLS: falling back to dummy implementation (build wasm-pack output into web/pkg_mls to enable OpenMLS)', e);
    return { MlsAdmin: DummyMlsAdmin, MlsMember: DummyMlsMember, kind: 'dummy' };
  }
}

export async function createAdmin(streamId, storageKey) {
  const { MlsAdmin, kind } = await loadReal();
  const existing = localStorage.getItem(storageKey);
  let admin;
  if (existing) admin = MlsAdmin.load(streamId, existing);
  else admin = new MlsAdmin(streamId);
  return { admin, kind, persist: () => localStorage.setItem(storageKey, admin.persist()) };
}

export async function createMember(identity, storageKey) {
  const { MlsMember, kind } = await loadReal();
  const existing = localStorage.getItem(storageKey);
  let member;
  if (existing) member = MlsMember.load(identity, existing);
  else member = new MlsMember(identity);
  return { member, kind, persist: () => localStorage.setItem(storageKey, member.persist()) };
}
