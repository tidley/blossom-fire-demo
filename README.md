# Blossom Fire Demo (POC)

This repo is a proof-of-concept for **client-side encrypted media hosting** (Blossom-style blob storage) with **per-npub access control**.

### Why it’s called “Blossom Fire”

Because once ciphertext starts spreading across blob hosts, caches, and mirrors, it becomes **hard to “put out”**: even if one provider blocks you or goes down, the content can keep propagating and staying available — while access remains controlled by cryptographic keys.

It now supports an experimental **MLS (Messaging Layer Security)** group-key flow using **OpenMLS compiled to WASM** (Rust → wasm-bindgen/wasm-pack). Nostr is used as transport:

- **Join requests** are sent privately to the Admin via **NIP-17 gift wrap** (outer **kind 1059**, inner **kind 14**).
- **Welcome/Commit messages** are also sent via **NIP-17**.

If the WASM package is not built/available, the app falls back to a **DummyMlsGroup** that behaves like the old per-frame-key demo.

It implements a "near-live" **encrypted slideshow** first (camera → frames → encrypted blobs), because it’s the simplest way to prove:

- everyone can fetch ciphertext blobs, but
- only *allowed* `npub`s receive the keys, and
- you can toggle access on/off live (effective on the next frame).

Once this is proven, the exact same pattern upgrades to **near-live video** (MediaRecorder chunks) with MSE playback.

---

## What’s happening (end-to-end)

### Core crypto pattern (MLS exporter → per-chunk keys)

For each frame/chunk `i`:

1. Admin maintains an MLS group (OpenMLS).
2. Broadcaster/viewers join via **Join → Welcome → Commit**.
3. Each member computes an **exporter secret** from the current MLS epoch.
4. The per-frame key is derived deterministically:
   - `K_i = SHA-256(exporter_secret || utf8(streamId + ":" + i))` (32 bytes)
5. The frame bytes are encrypted with **AES-256-GCM** using `K_i`.
6. The ciphertext is uploaded to the blob host.

**Important:** blobs are public/guessable by hash, but the content is private without the current MLS epoch secret.

### Fixed-size AAD
Some WebCrypto implementations are picky about AES-GCM `additionalData` (AAD) length.

This demo uses:

- `AAD_i = SHA-256(utf8(streamId + ":" + frameId))` → **32 bytes**

This binds each ciphertext to its stream+frame index (prevents swapping frames without detection).

### Nostr pieces

We use one or more relays (configurable) for:

- **Public events** (frame/chunk announcements)
- **Private control-plane messages** (join/welcome/commit) via **NIP-17**.

#### Public frame announcement (kind 1)
Broadcaster publishes a public event per frame:

- tags:
  - `t=blossom-fire-demo`
  - `d=<streamId>`
  - `i=<frameId>`
  - `x=<blobHash>`
  - `m=image/webp`

Anyone can see these and fetch ciphertext, but cannot decrypt without keys.

#### Join request (NIP-17)
Each viewer/broadcaster auto-generates a Nostr keypair in the browser (stored in `localStorage`) and sends a **NIP-17** message to the Admin pubkey containing an MLS `KeyPackage`.

Admin uses this to populate the allowlist UI.

#### MLS Welcome/Commit transport (NIP-17)

- Viewer/Broadcaster → Admin: NIP-17 `{type:"mls_join", role, kp}`
- Admin → New member: NIP-17 `{type:"mls_welcome", welcome, commit}`
- Admin → Existing members: NIP-17 `{type:"mls_commit", commit}` so everyone advances to the new epoch.

Revocation remains "forward-only" at the epoch level: removing members isn’t implemented yet; but after each add/commit, only current members can derive future keys.

---

## Components

- `web/`
  - `broadcast.html`: camera → encrypt with MLS-derived keys → upload → announce
  - `admin.html`: MLS group admin; approves join requests; sends Welcome/Commit
  - `view.html`: join MLS; fetch ciphertext + decrypt via MLS-derived keys
- `mls-wasm/`: Rust crate compiled to WASM (OpenMLS) used by the web pages
- `blob/server.js`: minimal blob store used like Blossom (upload bytes → hash; fetch by hash). Includes permissive CORS for the demo.
- `relay/config.toml`: nostr-rs-relay config (ensure relay accepts writes).

### Build the OpenMLS WASM package

This step is optional (the demo will fall back to `DummyMlsGroup`), but required for the real MLS flow.

Build (recommended, uses docker `rustwasm/wasm-pack` if you don't have wasm-pack installed):

```bash
npm run build:mls
```

Or build locally:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
cd mls-wasm
wasm-pack build --release --target web --out-dir ../web/pkg_mls
```

---

## Quickstart (VPS, HTTPS)

### 1) Choose domains
Pick 3 hostnames (subdomains) you control and point them at your VPS IP:

- `DEMO_HOST` (serves the web UI) — e.g. `demo.example.com`
- `BLOSSOM_HOST` (serves encrypted blobs) — e.g. `blossom.example.com`
- `RELAY_HOST` (serves a Nostr relay over WSS) — e.g. `relay.example.com`

### 2) DNS
Create **A records** for each hostname to your VPS public IP.

Important:
- Ensure **only one A record** per name (don’t leave old host IPs around).
- Lower TTL (e.g. 60–300s) while iterating.

### 3) Configure Caddy / docker-compose
This repo ships a `docker-compose.prod.yml` + `Caddyfile` that expects environment variables.

Create an `.env` on the VPS:

```bash
DEMO_HOST=demo.example.com
BLOSSOM_HOST=blossom.example.com
RELAY_HOST=relay.example.com
CADDY_EMAIL=you@example.com
```

### 4) Configure the web app
Edit `web/config.js` for your deployment:

- set `RELAYS` to include your relay WSS URL (e.g. `wss://relay.example.com`)
- set `BLOB_BASE` to your blossom host (e.g. `https://blossom.example.com`)
- set `ADMIN_SK_HEX` (and update `ADMIN_PUB_HEX` to match)

### 5) Build MLS WASM + run
On the VPS:

```bash
git clone https://github.com/tidley/blossom-fire-demo.git
cd blossom-fire-demo

npm ci
npm run build:mls

sudo docker compose -f docker-compose.prod.yml --env-file .env up -d
sudo docker compose -f docker-compose.prod.yml ps
```

Then open:

- `https://DEMO_HOST/admin.html?stream=demo1`
- `https://DEMO_HOST/broadcast.html?stream=demo1`
- `https://DEMO_HOST/view.html?stream=demo1`

Video pages:
- `https://DEMO_HOST/broadcast-video.html?stream=video3`
- `https://DEMO_HOST/admin.html?stream=video3`
- `https://DEMO_HOST/view-video.html?stream=video3`

**Note:** camera + WebCrypto generally require HTTPS (secure context).

---

## Tests

### Unit tests (CI-friendly)

```bash
npm install
npm test
```

Covers:

- AES-256-GCM encrypt/decrypt + failure on wrong **32-byte AAD hash**
- NIP-17 gift wrap roundtrip
- announcement tag parsing
- admin allowlist gating → which viewer payloads are forwarded
- MSE append queue logic (next-chunk selection + pruning)

### Minimal E2E tests (non-browser)

This repo includes a small Node-based sanity test suite:

```bash
npm install
RELAY=wss://relay.tomdwyer.uk BLOSSOM=https://blossom.tomdwyer.uk npm run test:e2e
```

It checks:

- blob upload/fetch roundtrip
- relay publish/subscribe roundtrip
- NIP-17 gift wrap roundtrip

### Browser E2E smoke tests (Playwright)

These are intentionally lightweight (they verify the pages boot and basic UI state works).

```bash
# start local services (relay + blob + static web)
docker compose up -d

# run
npm run test:e2e:pw
```

---

## Moving to video (next)

The upgrade is conceptual, not architectural:

- slideshow frames → **MediaRecorder chunks** (e.g. 1s)
- encrypt each chunk with a fresh `K_i`
- upload ciphertext chunk to Blossom
- announce chunk on Nostr
- members derive keys via MLS exporter (no per-chunk key forwarding)

Viewer playback will use **Media Source Extensions (MSE)** to append decrypted fMP4/WebM chunks.

Recommended next steps:

1. Replace frame capture with `MediaRecorder(stream, {mimeType})` (timeslice 1000ms)
2. Encrypt/upload each chunk
3. Implement MSE buffer append on the viewer

---

## Security notes (POC)

- This is a demo. Keys live in browser memory/localStorage.
- Relay is likely permissive/open unless you lock it down.
- Revocation is forward-only (stop sending future keys).
- For production, you’d add payment gating, allowlists, pairing, rate limits, and stronger operational security.
