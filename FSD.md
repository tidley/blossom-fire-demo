# Blossom Fire Demo — Functional Specification (FSD)

**Repo:** https://github.com/tidley/blossom-fire-demo  
**Status:** Proof-of-concept evolving toward MLS + real NIP-17 transport  
**Primary goals:** Client-side encrypted media hosting (“Blossom-style” blobs) with cryptographic access control per viewer, using Nostr for discovery/control-plane.

---

## 1. Scope

### 1.1 In scope
- Near-live **encrypted media streaming**:
  - slideshow frames (image/webp) and/or video chunks (MediaRecorder → WebM/fMP4 chunks)
- **Public blob storage** for ciphertext:
  - anyone can fetch ciphertext by hash
  - only authorized viewers can decrypt
- **Dynamic access control**:
  - viewers can be granted/revoked while stream is running
  - revocation is forward-only (cannot claw back already delivered keys)
- **Nostr-based control-plane**:
  - stream announcements
  - join/access requests
  - cryptographic group control messages
- **MLS-based group encryption** for ongoing key delivery:
  - Admin is the **MLS group controller** (adds/removes members)
  - Application messages (per-chunk keys / key derivation material) are delivered via MLS
- **Real NIP-17** transport for encrypted control-plane messages (join/welcome/commit, etc.).

### 1.2 Out of scope (for this repo)
- Payments, subscriptions, and billing
- Strong anti-abuse/rate-limiting beyond basic measures
- Perfect revocation (impossible once keys are delivered)
- High-scale relay infrastructure / multi-relay reliability guarantees
- Formal verification / production-grade key management

---

## 2. Terminology

- **Stream**: A logical sequence of frames/chunks identified by `streamId`.
- **Chunk**: A unit of media (one image frame or one recorded video segment).
- **Blob store**: HTTP service that stores and serves raw bytes by content hash (Blossom-like).
- **Ciphertext blob**: Encrypted chunk bytes uploaded to the blob store.
- **Key material**:
  - `K_i`: symmetric key used to encrypt chunk `i`
  - `AAD_i`: additional authenticated data bound to the stream/chunk index
- **Admin**: Operator UI that grants/revokes viewers; **MLS controller**.
- **Viewer**: Recipient who requests access and decrypts.
- **Broadcaster**: Produces media chunks and publishes announcements.
- **NIP-17**: Nostr “gift wrap” (encrypted messaging) used for control-plane.
- **MLS**: Messaging Layer Security group state used for scalable group encryption.

---

## 3. High-Level Architecture

### 3.1 Components
1. **Web UI (static hosting)**
   - `broadcast*.html`: capture/record, encrypt, upload, announce
   - `admin.html`: approve/deny viewers, manage MLS group, distribute handshakes
   - `view*.html`: request access, receive MLS state, decrypt and play

2. **Blob server**
   - Upload bytes → returns content hash
   - Fetch by hash
   - Must support CORS for browser access

3. **Nostr relay(s)**
   - Hosts public announcements
   - Hosts encrypted NIP-17 control-plane events
   - Hosts MLS application messages (ciphertexts) (publicly visible but confidential)

4. **MLS core (Rust → WASM)**
   - Runs in browser (Admin + Viewer)
   - Implements group creation, member add/remove, welcome/commit processing
   - Exposes exporter secrets and MLS application message encryption/decryption

---

## 4. Threat Model & Security Goals

### 4.1 Security goals
- Confidentiality of media content against:
  - unauthorized viewers
  - blob server operators
  - relay operators
- Integrity of media content:
  - viewer must detect tampering/swapping
- Access control:
  - only approved viewers can decrypt *future* chunks
- Minimize per-viewer work for key distribution:
  - avoid O(N) re-encryption per chunk at Admin

### 4.2 Non-goals / accepted limitations
- **Forward-only revocation**: once a viewer has `K_i`, they can keep that chunk.
- Nostr delivery is best-effort; out-of-order and missing events must be handled.

---

## 5. Cryptography

### 5.1 Chunk encryption
For each chunk index `i`:
- Generate or derive a 32-byte key `K_i`.
- Compute fixed-size AAD:
  - `AAD_i = SHA-256(utf8(streamId + ":" + i))` (32 bytes)
- Encrypt chunk bytes with AES-256-GCM:
  - output: `iv` (random, e.g. 12 bytes) and `ciphertext`

**Ciphertext blob format (recommended):**
- Store a small self-describing envelope, e.g. CBOR/JSON header + raw bytes, or JSON with base64 fields.
- MVP can store `{iv,ciphertext}` as JSON if size is acceptable; otherwise store binary layout.

### 5.2 Key schedule options
Two acceptable modes:

**Mode A (direct per-chunk random keys)**
- `K_i = random(32 bytes)`
- Deliver `K_i` (and metadata) to authorized viewers via MLS application messages.

**Mode B (epoch exporter → HKDF per-chunk keys)**
- Let MLS exporter provide `epochKey` (32 bytes) per epoch:
  - `epochKey = MLS.export_secret(label="blossom-fire", context=utf8(streamId), len=32)`
- Derive chunk key via HKDF-SHA256:
  - `K_i = HKDF(ikm=epochKey, salt=utf8(streamId), info=utf8("chunk:"+i), len=32)`

**Note:** Mode B reduces message size (you may only need to signal indices), but Mode A is simpler for MVP.

---

## 6. Nostr Event Model

### 6.1 Public chunk announcement (unencrypted)
- Kind: `1` (text note) for MVP
- Tags (normative):
  - `t=blossom-fire-demo` (or `TAG_DEMO_*`)
  - `d=<streamId>`
  - `i=<chunkId>`
  - `x=<blobHash>`
  - `m=<mime>`
- Content: optional human-readable message

**Purpose:** discovery and retrieval of ciphertext blobs.

### 6.2 Viewer access/join request (encrypted control-plane)
- Transport: **NIP-17** (real gift wrap)
- Sender: Viewer
- Recipient: Admin
- Payload: see §7 (Control-plane schemas)

### 6.3 MLS handshake distribution (encrypted control-plane)
- Transport: **NIP-17**
- Welcome: Admin → Viewer
- Commit: Admin → members (existing members + possibly the new member depending on MLS semantics)

### 6.4 MLS application messages (public ciphertext)
- Published to relay as a normal event (kind TBD; can be kind `1` or a dedicated kind)
- Tags:
  - `t=blossom-fire-demo-mls-app`
  - `d=<streamId>`
  - `i=<chunkId>` (optional but convenient)
- Content: base64 of MLS ciphertext (or JSON wrapper)

**Security property:** The ciphertext can be public; only members with current MLS state decrypt.

---

## 7. Control-Plane Message Schemas (NIP-17 payloads)

All messages are JSON objects with a base header:
- `type: string`
- `v: number` (schema version)
- `streamId: string`
- `ts?: number` (unix seconds, optional)

### 7.1 join-request (Viewer → Admin)
```json
{ "type": "join-request", "v": 1, "streamId": "demo1", "nostrPubkey": "<hex>", "keyPackageB64": "...", "ciphersuite": "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519" }
```

**Requirements:**
- Admin MUST validate that the NIP-17 outer sender pubkey matches `nostrPubkey`.

### 7.2 welcome (Admin → Viewer)
```json
{ "type": "welcome", "v": 1, "streamId": "demo1", "welcomeB64": "...", "commitB64": "..." }
```

Notes:
- Depending on OpenMLS workflow, the commit that added the member may be needed by others; new member may learn state from Welcome.

### 7.3 commit (Admin → Members)
```json
{ "type": "commit", "v": 1, "streamId": "demo1", "commitB64": "..." }
```

### 7.4 resync-request (Viewer → Admin)
```json
{ "type": "resync-request", "v": 1, "streamId": "demo1", "reason": "epoch-mismatch|missing-commit|other" }
```

Admin response may be a fresh `welcome` (simplest) or replay commits.

---

## 8. User Flows

### 8.1 Stream start (Admin)
1. Admin opens `admin.html?stream=<streamId>`
2. Admin creates or loads MLS group state for `streamId`.
3. Admin listens for join requests via NIP-17.

### 8.2 Viewer join (Viewer → Admin → Viewer)
1. Viewer opens `view*.html?stream=<streamId>`
2. Viewer generates:
   - Nostr keypair for this browser profile (existing behavior)
   - MLS KeyPackage via WASM
3. Viewer sends NIP-17 `join-request` to Admin.
4. Admin UI shows pending request; operator toggles allow.
5. Admin:
   - adds member to MLS group
   - sends NIP-17 `welcome` to viewer
   - sends NIP-17 `commit` to existing members (or equivalent)
6. Viewer processes welcome, becomes an MLS member.

### 8.3 Broadcast chunk (Broadcaster)
1. Broadcaster captures/records chunk.
2. Encrypts chunk to ciphertext blob.
3. Uploads ciphertext blob to blob server, gets `blobHash`.
4. Publishes public chunk announcement (kind 1) with `blobHash`.
5. Key distribution:
   - If using direct per-chunk keys (Mode A): broadcaster provides key material to Admin via NIP-17 OR Admin derives/receives it.
   - Admin publishes MLS application message containing key payload for chunk `i`.

### 8.4 Viewer playback
1. Viewer subscribes to announcements for `streamId`.
2. For each announced chunk:
   - fetch ciphertext blob
   - wait for corresponding MLS app message / key payload
   - decrypt chunk
   - render image / append to MSE pipeline

### 8.5 Revocation
1. Admin removes viewer from MLS group.
2. Admin publishes and distributes commit.
3. Removed viewer cannot decrypt future MLS application messages.

---

## 9. Storage & State

### 9.1 Browser storage
- Nostr keys: `localStorage` (POC) or IndexedDB
- MLS group state:
  - MUST be persisted per `streamId`
  - RECOMMENDED: IndexedDB object store `groups` keyed by `streamId`
- Deduplication:
  - Keep set of processed Nostr event IDs per stream to avoid replays

### 9.2 Resilience requirements
- If viewer fails to process a commit / becomes out-of-sync:
  - viewer SHOULD send `resync-request`
  - admin MAY re-issue welcome

---

## 10. NIP-17 Requirements (Real Implementation)

### 10.1 Functional requirements
- Implement actual NIP-17 gift wrap:
  - Outer event kind(s) as specified by NIP-17
  - Proper per-recipient wrapping
  - Use NIP-44 or NIP-59 primitives as required by NIP-17 spec (depending on final mapping)
- Must support:
  - send JSON payload to a recipient
  - subscribe and decrypt messages addressed to us
  - sender authentication (bind sender pubkey)
  - replay protection hooks (dedup at app layer)

### 10.2 Constraints
- Keep current `nip17SendJson` / `nip17SubJson` interface stable if possible.
- Avoid adding heavy build tooling to the web layer; keep wrappers minimal.

---

## 11. Non-Functional Requirements

- **Demo-first:** should run locally with docker compose and in-browser without complex setup.
- **Observability:** UI should show:
  - join requests pending
  - MLS membership state
  - current chunk index
  - decrypt failures and “out of sync” status
- **Compatibility:** secure contexts (HTTPS) for camera + WebCrypto.

---

## 12. TODO Checklist

### 12.1 NIP-17 (real)
- [ ] Read/confirm NIP-17 event kinds/tags and encryption scheme used (align with spec)
- [ ] Replace current placeholder `web/nip17.js` (kind 4 DM shim) with real NIP-17 gift wrap
- [ ] Add tests for NIP-17:
  - [ ] encrypt/decrypt roundtrip
  - [ ] sender binding
  - [ ] multi-recipient behavior (if needed)
  - [ ] replay/dedup behavior

### 12.2 MLS core (Rust/WASM)
- [ ] Implement `mls-wasm` crate using OpenMLS:
  - [ ] viewer: generate KeyPackage
  - [ ] admin: create group
  - [ ] admin: add member → welcome + commit
  - [ ] admin: remove member → commit
  - [ ] member: process welcome/commit
  - [ ] exporter secret for `epochKey`
  - [ ] encrypt/decrypt MLS application messages
- [ ] wasm build pipeline:
  - [ ] add `wasm-pack` build script
  - [ ] ensure reproducible builds + documentation

### 12.3 Web integration
- [ ] `admin.html`: MLS group creation/loading, join approval, send welcome/commit
- [ ] `view*.html`: generate KeyPackage, send join-request, process welcome/commit
- [ ] Replace per-viewer fanout with MLS app message publish (single ciphertext per chunk)
- [ ] Add resync UX:
  - [ ] detect epoch mismatch
  - [ ] send `resync-request`
  - [ ] admin re-welcome

### 12.4 Reliability / scaling
- [ ] Decide how to handle large welcome/commit payloads:
  - [ ] store in Blossom and send hash pointer
- [ ] Add IndexedDB stores:
  - [ ] `groups`
  - [ ] `dedup`
  - [ ] optional `pending` queues

### 12.5 Documentation
- [ ] Update README with MLS + NIP-17 flows and demo URLs
- [ ] Add message schema doc (or reference this FSD section)

---

## 13. Open Questions
- Which media mode is the primary demo target right now: slideshow, video, or both?
- Do we want MLS application messages to include full `{chunkId, key, blobHash, mime}` (Mode A), or move to exporter/HKDF schedule (Mode B) and send only minimal signals?
- Will we use one relay or multiple relays for redundancy?
