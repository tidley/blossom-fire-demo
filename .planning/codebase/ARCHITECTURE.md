# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Static browser clients plus a minimal blob-storage HTTP service, coordinated through a Nostr relay and local browser state.

**Key Characteristics:**
- Frontend behavior is implemented primarily as inline ES module scripts inside `web/*.html`.
- Shared browser logic is factored into small helper modules in `web/*.js`.
- The backend is a single-process Node HTTP server in `blob/server.js`; there is no application framework, database layer, or API router abstraction.
- Cross-client coordination happens through Nostr events and DMs; encrypted media blobs are stored separately by content hash.
- Runtime state is mostly ephemeral or browser-local: `Map` objects in pages, `localStorage` keypairs, and blob files on disk under the blob server's storage directory.

## Layers

**UI Entry Layer:**
- Purpose: Provide browser entry points for each user role and mode.
- Contains: Static pages `web/index.html`, `web/broadcast.html`, `web/admin.html`, `web/view.html`, `web/broadcast-video.html`, and `web/view-video.html`.
- Depends on: Shared browser helpers in `web/config.js`, `web/util.js`, `web/blob.js`, `web/crypto.js`, `web/announcement.js`, `web/admin-gate.js`, and `web/mse-pump.js`.
- Used by: Human operators opening the demo in a browser.

**Browser Workflow Layer:**
- Purpose: Execute slideshow capture, video chunk capture, admin key forwarding, viewer access requests, decryption, and preview/playback flows.
- Contains: Inline module code in `web/broadcast.html`, `web/admin.html`, `web/view.html`, `web/broadcast-video.html`, and `web/view-video.html`.
- Depends on: Browser APIs (`getUserMedia`, `MediaRecorder`, `MediaSource`, `localStorage`, `fetch`, WebCrypto), Nostr helpers from `web/util.js`, crypto helpers from `web/crypto.js`, and blob I/O from `web/blob.js`.
- Used by: The UI entry layer pages once loaded.

**Shared Browser Utility Layer:**
- Purpose: Centralize reusable protocol, crypto, transport, and queue helpers so pages do not duplicate low-level logic.
- Contains: `web/util.js`, `web/crypto.js`, `web/blob.js`, `web/nip44wrap.js`, `web/announcement.js`, `web/admin-gate.js`, `web/mse-pump.js`, and `web/config.js`.
- Depends on: `nostr-tools` from `https://esm.sh/nostr-tools@2.10.2`, browser WebCrypto APIs, and the runtime host values derived in `web/config.js`.
- Used by: All role-specific HTML entry points and unit tests under `tests/unit/`.

**Blob Storage Layer:**
- Purpose: Store opaque encrypted payloads by SHA-256 hash and serve them back verbatim.
- Contains: `blob/server.js`.
- Depends on: Node built-ins (`node:http`, `node:crypto`, `node:fs`, `node:path`, `node:url`) and filesystem storage under `BLOB_DIR`.
- Used by: Browser pages through `web/blob.js` and the Node sanity test in `tests/e2e.mjs`.

**Relay / External Infrastructure Layer:**
- Purpose: Provide the event transport that links broadcaster, admin, and viewers.
- Contains: Runtime relay service declared in `docker-compose.yml` and configured by `relay/config.toml`.
- Depends on: `nostr-rs-relay` container image and Docker Compose.
- Used by: Browser pages via `web/util.js` and the relay roundtrip check in `tests/e2e.mjs`.

**Test Layer:**
- Purpose: Validate isolated helpers, basic browser boot flows, and external service roundtrips.
- Contains: Unit tests in `tests/unit/*.test.js`, Playwright smoke coverage in `tests/e2e/smoke.spec.js`, and Node-based integration checks in `tests/e2e.mjs`.
- Depends on: `vitest`, `@playwright/test`, `nostr-tools`, and running demo services for E2E paths.
- Used by: `npm test`, `npm run test:unit`, `npm run test:e2e`, and `npm run test:e2e:pw` from `package.json`.

## Data Flow

**Slideshow Broadcast Flow:**

1. A broadcaster opens `web/broadcast.html` and obtains a camera stream with `navigator.mediaDevices.getUserMedia()`.
2. The page captures a frame to `<canvas>`, encodes it as WebP, and derives a 32-byte AAD from `SHA-256(streamId:frameId)` using helpers in `web/crypto.js`.
3. The frame bytes are encrypted with AES-GCM, prefixed with the IV, and uploaded through `web/blob.js` to `blob/server.js`.
4. The broadcaster publishes a public kind-1 announcement describing the frame and separately sends the frame key to the admin as a NIP-44-encrypted kind-4 DM using helpers from `web/util.js`.
5. `web/admin.html` decrypts the admin DM, stores the key in memory, optionally decrypts for preview, and forwards the key only to viewers marked allowed in its `viewers` map.
6. `web/view.html` combines public announcements with private key DMs, fetches the encrypted blob, decrypts it, and swaps the image element to the latest authorized frame.

**Near-Live Video Flow:**

1. A broadcaster opens `web/broadcast-video.html`, records camera and audio chunks with `MediaRecorder`, and encrypts each chunk with a fresh AES-GCM key plus the same `SHA-256(streamId:chunkId)` AAD pattern.
2. The encrypted chunk is uploaded to `blob/server.js`, then announced publicly with video metadata tags.
3. The broadcaster sends the chunk key to the admin through a NIP-44 DM.
4. `web/admin.html` stores video chunk keys, can decrypt chunks for a local preview pipeline, and forwards keys to allowed viewers.
5. `web/view-video.html` waits until it has both the public chunk announcement and the private key DM, fetches and decrypts the blob, and hands decrypted bytes to the MSE queue logic in `web/mse-pump.js`.
6. The MSE pump appends the next available decrypted chunk to a `SourceBuffer` in sequence for near-live playback.

**Service Startup Flow:**

1. `docker-compose.yml` starts three containers: `relay`, `blob`, and `web`.
2. The `web` container serves static files from `web/`.
3. The `blob` container runs `node server.js` from `blob/`.
4. The `relay` container runs `nostr-rs-relay` with `relay/config.toml`.

**State Management:**
- Browser identity is persisted in `localStorage` via `getOrCreateViewerKeypair()` in `web/util.js`.
- Page-level operational state is held in in-memory `Map` objects inside `web/admin.html`, `web/view.html`, and `web/view-video.html`.
- Blob persistence is file-based under the directory configured by `BLOB_DIR` in `blob/server.js`; by default the Compose setup mounts `./data/blobs`.
- There is no database, shared server-side session store, or centralized cache layer in the repository.

## Key Abstractions

**Role-Specific Page Controller:**
- Purpose: Each HTML page acts as a self-contained controller for one actor in the demo.
- Examples: `web/broadcast.html`, `web/admin.html`, `web/view.html`, `web/broadcast-video.html`, `web/view-video.html`.
- Pattern: Inline page script owning DOM references, subscriptions, and runtime maps.

**Nostr Transport Helper:**
- Purpose: Hide relay subscription and event-signing details behind simple helper functions.
- Examples: `pool`, `publish()`, `sub()`, `makeSignedEventUnsigned()`, `nip44Encrypt()`, and `nip44Decrypt()` in `web/util.js`.
- Pattern: Shared module wrapper over `nostr-tools` and relay configuration from `web/config.js`.

**Blob Payload Envelope:**
- Purpose: Represent encrypted media as `iv || ciphertext`, addressed by SHA-256 hash.
- Examples: Upload assembly in `web/broadcast.html` and `web/broadcast-video.html`; retrieval and splitting in `web/admin.html`, `web/view.html`, and `web/view-video.html`.
- Pattern: Simple binary envelope with separate metadata carried in Nostr events and DMs.

**Access-Gated Key Distribution:**
- Purpose: Separate public blob discovery from private decryption-key delivery.
- Examples: Admin forwarding logic in `web/admin.html` and pure helper coverage in `web/admin-gate.js`.
- Pattern: Hybrid encryption workflow using per-frame/per-chunk symmetric keys and NIP-44 DMs for key transport.

**MSE Append Queue:**
- Purpose: Feed decrypted video chunks to the browser in the correct order while trimming buffered in-memory state.
- Examples: `chooseNextChunkId()`, `pruneDecrypted()`, and `createPump()` in `web/mse-pump.js`, used by `web/view-video.html` and referenced by `web/admin.html`.
- Pattern: Small state-machine helper around `MediaSource` and `SourceBuffer`.

## Entry Points

**Static Index:**
- Location: `web/index.html`
- Triggers: Browser navigation to the demo root.
- Responsibilities: Link operators to the admin, slideshow, and video pages.

**Slideshow Broadcast Page:**
- Location: `web/broadcast.html`
- Triggers: Browser navigation to `/broadcast.html?stream=...`.
- Responsibilities: Capture frames, encrypt, upload blobs, announce frames, and DM keys to the admin.

**Admin Page:**
- Location: `web/admin.html`
- Triggers: Browser navigation to `/admin.html?stream=...`.
- Responsibilities: Subscribe to viewer requests and broadcaster DMs, manage allowlist state, preview decrypted media, and forward keys.

**Slideshow Viewer Page:**
- Location: `web/view.html`
- Triggers: Browser navigation to `/view.html?stream=...`.
- Responsibilities: Generate a viewer keypair, request access, receive keys, fetch blobs, and decrypt images.

**Video Broadcast Page:**
- Location: `web/broadcast-video.html`
- Triggers: Browser navigation to `/broadcast-video.html?stream=...`.
- Responsibilities: Record media chunks, encrypt/upload them, publish announcements, and DM keys to the admin.

**Video Viewer Page:**
- Location: `web/view-video.html`
- Triggers: Browser navigation to `/view-video.html?stream=...`.
- Responsibilities: Request access, collect video announcements and keys, decrypt chunks, and append them through MSE.

**Blob Service Entry:**
- Location: `blob/server.js`
- Triggers: `node server.js` in the `blob` service from `docker-compose.yml`.
- Responsibilities: Accept blob uploads, serve blob reads by hash, and expose a `/health` endpoint.

**Automated Test Entrypoints:**
- Location: `tests/e2e.mjs`, `tests/e2e/smoke.spec.js`, and `tests/unit/*.test.js`
- Triggers: NPM scripts defined in `package.json`.
- Responsibilities: Exercise helper functions, browser boot flows, and relay/blob roundtrips.

## Error Handling

**Strategy:** Localized error handling with `try/catch` blocks in browser pages, HTTP status codes in the blob server, and test-process failure for automated checks.

**Patterns:**
- Browser pages usually catch errors near async boundaries and write a human-readable string into a status element such as `#status`.
- The blob server in `blob/server.js` responds with `404` for missing blobs and `200` JSON for successful uploads and health checks; there is no centralized middleware or structured error type.
- Helper modules throw plain `Error` instances when required inputs are missing or invalid, for example in `web/admin-gate.js` and `web/nip44wrap.js`.
- Tests rely on thrown exceptions and assertion failures; there is no custom test harness abstraction beyond Vitest and Playwright defaults.

## Cross-Cutting Concerns

**Logging:**
- Browser pages use `console.error()` and `console.warn()` sparingly alongside status text updates.
- `blob/server.js` logs only a startup line when the server begins listening.
- There is no structured logging library in the repository.

**Validation:**
- Cryptographic integrity depends on consistent tag parsing and the derived 32-byte AAD in `web/crypto.js`.
- Announcement parsing and forwarding-shape validation live in pure helpers `web/announcement.js` and `web/admin-gate.js`.
- There is no schema-validation library or shared request-validation layer.

**Authentication / Authorization:**
- Authorization is stream-scoped and forward-only: the admin page decides who receives future decryption keys.
- Identity is based on Nostr keypairs generated in the browser or injected from `ADMIN_SK_HEX` in `web/config.js`.
- There is no server-enforced auth layer in `blob/server.js` or `relay/config.toml`; the repository explicitly uses permissive demo infrastructure.

**Configuration:**
- Browser runtime endpoints and the demo admin key live in `web/config.js`.
- Container wiring lives in `docker-compose.yml`.
- Relay behavior lives in `relay/config.toml`.
- No `.env` file, config loader, or per-environment build system is present in the repository.

---

*Architecture analysis: 2026-03-10*
*Update when major patterns change*
