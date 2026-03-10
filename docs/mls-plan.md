# MLS branch plan (Blossom Fire)

This document describes the **MLS-based** version of the Blossom Fire demo.

Goal: keep the current `main` branch as the working POC (public announcements + NIP-44 key forwarding), and create an `mls` branch that demonstrates a **group-friendly, low-metadata** access model:

- Chunk keys derived from MLS epoch secrets (no per-chunk per-viewer key fanout)
- Chunk announcements delivered to group members via MLS-protected application messages
- Transport via NIP-17 (gift-wrap) for privacy and inbox-friendly delivery
- Admin hosts authoritative group state

---

## Why MLS changes the system

In the current demo, admin forwards a per-chunk key to each allowed viewer (N viewers × N chunks messages).

With MLS:

- Admin maintains group state.
- Members that are currently allowed can derive the per-chunk key locally.
- Removing a member rotates the epoch (commit), cutting them off for future chunks.

This makes access toggles scalable and avoids obvious per-viewer key fanout.

---

## Roles

- **Broadcaster**: produces media chunks, uploads ciphertext to Blossom.
- **Admin (group host)**:
  - owns authoritative MLS group state
  - approves join requests
  - produces Welcome/Commit messages
  - may act as broadcaster (optional)
- **Viewer**:
  - requests to join
  - applies Welcome/Commit messages
  - derives per-chunk keys from MLS exporter

---

## Transport: NIP-17

All control-plane messages are delivered using **NIP-17 gift-wrapped DMs**.

Message types (JSON payloads, versioned):

- `join-request` (viewer -> admin)
- `welcome` (admin -> viewer)
- `commit` (admin -> all members)
- `chunk-announcement` (admin/broadcaster -> all members)

NIP-17 provides:

- better metadata privacy than kind-4 DMs
- inbox-based delivery patterns

---

## MLS key schedule

We want a deterministic per-chunk key without sending it per viewer.

Per epoch:

- `epochKey = MLS.exporter(label="blossom-fire", context=streamId, length=32)`

Per chunk `i`:

- `K_i = HKDF(ikm=epochKey, salt=streamId, info="chunk:"+i, len=32)`

Encryption for each chunk:

- AES-256-GCM with:
  - random 12-byte IV
  - AAD = SHA-256(utf8(streamId+":"+chunkId)) (32 bytes)

---

## Chunk announcements via MLS (your idea)

Instead of public kind-1 announcements, the broadcaster/admin sends an MLS application message:

```json
{
  "type": "chunk-announcement",
  "v": 1,
  "streamId": "video3",
  "chunkId": 123,
  "blob": "<blossom hash>",
  "codec": "video/webm;codecs=vp8,opus",
  "created_at": 1710000000
}
```

This is encrypted to the MLS group and transported via NIP-17, so only current members learn blob hashes and timing.

Viewers:

- receive announcement
- compute `K_chunkId`
- fetch ciphertext blob from Blossom
- decrypt + append to MSE

---

## Revocation model

- Toggle OFF a viewer => remove from MLS group => send Commit => epoch rotates.
- Removed viewer can still decrypt chunks from epochs they already had state for.
- They cannot decrypt chunks after the removal commit.

---

## Cover traffic (optional): whitenoise-rs

Use https://github.com/marmot-protocol/whitenoise-rs to:

- add padding / timing jitter to control-plane messages
- optionally emit decoy announcements

Not required for MVP; add after MLS/NIP-17 path works.

---

## MVP implementation steps (branch `mls`)

1. Add `docs/mls-plan.md` (this file) and a minimal message schema (`docs/messages.md`).
2. Define transport wrapper for NIP-17 messages (send/receive).
3. Stub MLS group state interface:
   - `createGroup()`, `processWelcome()`, `processCommit()`, `exportEpochKey()`
4. Implement epoch-key derivation + chunk decrypt using derived key (no per-chunk key DMs).
5. Replace public announcements with group `chunk-announcement` messages.
6. Admin UI:
   - list join requests
   - accept/deny -> produce Welcome
   - remove -> Commit

---

## Notes / open questions

- Should broadcaster be required to be admin? (simplifies: one state owner)
- Where do we persist MLS state in viewers? (IndexedDB recommended)
- How do we handle multi-device viewers? (MLS supports, but UX needed)
