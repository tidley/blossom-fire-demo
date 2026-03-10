# Blossom Fire Demo (POC)

This repo is a proof-of-concept for **client-side encrypted media hosting** (Blossom-style blob storage) with **per-npub access control** using **NIP-44** key delivery over Nostr.

It implements a "near-live" **encrypted slideshow** first (camera → frames → encrypted blobs), because it’s the simplest way to prove:

- everyone can fetch ciphertext blobs, but
- only *allowed* `npub`s receive the keys, and
- you can toggle access on/off live (effective on the next frame).

Once this is proven, the exact same pattern upgrades to **near-live video** (MediaRecorder chunks) with MSE playback.

---

## What’s happening (end-to-end)

### Core crypto pattern (envelope / hybrid encryption)

For each frame `i`:

1. The broadcaster generates a fresh random symmetric key `K_i` (32 bytes).
2. The frame bytes are encrypted with **AES-256-GCM** using `K_i`.
3. The ciphertext is uploaded to the blob host ("Blossom" in spirit).
4. Access control is enforced by who receives `K_i`.

**Important:** blobs are public/guessable by hash, but the content is private without the key.

### Fixed-size AAD
Some WebCrypto implementations are picky about AES-GCM `additionalData` (AAD) length.

This demo uses:

- `AAD_i = SHA-256(utf8(streamId + ":" + frameId))` → **32 bytes**

This binds each ciphertext to its stream+frame index (prevents swapping frames without detection).

### Nostr pieces

We use a single relay (configurable) for:

- **Public events** (frame announcements, access requests)
- **Private key delivery** via **NIP-44**, transported in **kind 4** DMs.

#### Public frame announcement (kind 1)
Broadcaster publishes a public event per frame:

- tags:
  - `t=blossom-fire-demo`
  - `d=<streamId>`
  - `i=<frameId>`
  - `x=<blobHash>`
  - `m=image/webp`

Anyone can see these and fetch ciphertext, but cannot decrypt without keys.

#### Viewer access request (kind 1)
Each viewer auto-generates a Nostr keypair in the browser (stored in `localStorage`) and publishes:

- tags:
  - `t=blossom-fire-demo-req`
  - `d=<streamId>`

Admin uses this to populate the allowlist UI.

#### Key delivery (kind 4 DM, NIP-44 encrypted)

- Broadcaster → Admin: sends `{streamId, frameId, blobHash, key}` so the admin can forward selectively.
- Admin → Viewer: forwards the same key material only when the viewer is toggled ON.

Encryption is **NIP-44**:

- `conversationKey = nip44.getConversationKey(senderPrivkey, recipientPubkey)`
- `ciphertext = nip44.encrypt(plaintextJson, conversationKey)`

Revocation is "forward-only": once a viewer has a key, you can’t take it back, but you can stop sending **future** keys, so the stream stops at the next frame.

---

## Components

- `web/`
  - `broadcast.html`: capture camera → encode frame → encrypt → upload → announce + DM key to admin
  - `admin.html`: show waiting viewers; toggle ON/OFF; receive broadcaster keys and forward to allowed viewers
  - `view.html`: auto-keygen + access request; fetch ciphertext + decrypt when key arrives
- `blob/server.js`: minimal blob store used like Blossom (upload bytes → hash; fetch by hash). Includes permissive CORS for the demo.
- `relay/config.toml`: nostr-rs-relay config (ensure relay accepts writes).

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

### 3) Configure Caddy
Edit `Caddyfile` and replace the hostnames with your chosen ones:

```caddy
DEMO_HOST {
  root * /srv/web
  file_server
}

BLOSSOM_HOST {
  reverse_proxy blossom:3000
}

RELAY_HOST {
  reverse_proxy relay:8080
}
```

### 4) Configure the web app
Edit `web/config.js`:

- `RELAYS = ["wss://RELAY_HOST"]`
- `BLOB_BASE = "https://BLOSSOM_HOST"`

### 5) Run
On the VPS:

```bash
git clone https://github.com/tidley/blossom-fire-demo.git
cd blossom-fire-demo

sudo docker compose -f docker-compose.prod.yml up -d
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

## Minimal E2E tests (non-browser)

This repo includes a small Node-based sanity test suite:

```bash
npm install
RELAY=wss://relay.tomdwyer.uk BLOSSOM=https://blossom.tomdwyer.uk npm run test:e2e
```

It checks:

- blob upload/fetch roundtrip
- relay publish/subscribe roundtrip
- NIP-44 encrypt/decrypt roundtrip

---

## Branches

- `main`: working POC (public announcements + NIP-44 key forwarding)
- `mls`: planned branch for MLS + NIP-17 transport (see `docs/mls-plan.md`)

## Moving to video (next)

The upgrade is conceptual, not architectural:

- slideshow frames → **MediaRecorder chunks** (e.g. 1s)
- encrypt each chunk with a fresh `K_i`
- upload ciphertext chunk to Blossom
- announce chunk on Nostr
- admin forwards keys via NIP-44

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
