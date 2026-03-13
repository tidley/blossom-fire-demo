# Blossom Fire Demo

A sovereign-first live media prototype built on:

- **Nostr** for identity, access control, and coordination
- **Blossom blob storage** for media chunk transport
- **Local/self-hostable services** for relay + blob + web app

This project intentionally separates **control plane** from **data plane**:

- Control (who is allowed, key exchange, stream metadata) travels over Nostr events/DMs.
- Media payloads travel as chunk blobs.

That split is the core architectural choice.

---

## What this project is

Blossom Fire is a practical experiment in resilient, user-operated streaming:

- broadcaster publishes chunk announcements + admin key metadata
- admin authorizes viewers and forwards viewer-specific key metadata
- viewer fetches blobs and decodes only when authorized

It is designed to keep working when networks are uneven, relays are imperfect, and browsers are inconsistent.

---

## Why this matters for individual sovereignty

### 1) You control trust boundaries
You can run your own relay, blob server, and web front-end. No mandatory centralized signaling service.

### 2) Identity is portable
Identity/authorization are key-based and event-based, not tied to one app account database.

### 3) Policy is explicit
Access is granted through explicit signed messages (`access_req`, `viewerkey`, `adminkey`) rather than hidden backend ACLs.

### 4) Data/control decoupling reduces lock-in
You can replace transport/storage components without redesigning identity and access semantics.

### 5) Degrades gracefully
When strict MSE paths are unreliable (notably some Chrome conditions), compatibility playback keeps streams usable.

---

## Why it is good for low-reliability networks

This project is particularly strong when links are unstable, bursty, or high-latency:

- **Chunked delivery** tolerates temporary packet loss and jitter better than strict continuous pipelines.
- **Retry-friendly fetch model** handles transient 404 / eventual consistency delays.
- **Out-of-order tolerance** in control + chunk metadata allows recovery from relay timing mismatch.
- **Buffered playback strategy** (MSE path) supports rebuffer/resume behavior instead of hard failure.
- **Compatibility mode** keeps playback available when ideal pipeline assumptions break.

In short: it prefers **eventual playable continuity** over brittle “perfect realtime or fail”.

---

## Comparison matrix

| Property | Blossom Fire (this project) | Hivetalk-style realtime platforms | WebRTC + centralized SFU apps | Tokenized video networks (e.g. Livepeer-style) |
|---|---|---|---|---|
| Identity portability | High (Nostr keys/events) | Medium | Low-Medium | Medium |
| Control-plane sovereignty | High | Medium | Low-Medium | Medium |
| Data-plane sovereignty | High (self-hostable blobs) | Medium | Low-Medium | Medium-High |
| Browser realtime smoothness | Medium (improving) | High | High | Medium |
| Works on poor networks | High (chunk/retry/degrade) | Medium | Medium | Medium-High |
| Infra complexity | Medium | Medium | Medium | High |
| Vendor/platform lock-in risk | Low | Medium | Medium-High | Medium |
| Auditable trust boundaries | High | Medium | Low-Medium | Medium |

---

## Core protocol flow (simplified)

1. **Viewer requests access** (`access_req` via NIP-17)
2. **Broadcaster emits chunk + metadata** (`adminkey`, announcement event)
3. **Admin forwards authorization material** (`viewerkey`) to allowed viewers
4. **Viewer fetches chunk blob + decodes** if authorized
5. **Playback uses MSE or compatibility mode** depending on runtime stability

---

## Reliability and safety notes

- Current browser behavior differs significantly across engines; compatibility mode is expected for some Chrome cases.
- This is a demo/prototype architecture, not a hardened production security product.
- Keep admin keys and deployment boundaries under your direct operational control.

---

## Local development

Project root: `/home/tom/code/sec06/blossom-fire-demo`

Key areas:

- `web/` — broadcaster/admin/viewer frontends
- `blob/` — blob service
- `relay/` — relay service
- `docker-compose*.yml` — local/prod orchestration
- `tests-*.mjs` — protocol and pipeline tests

---

## Strategic direction

Short term:

- stabilize Chrome MSE path while keeping compatibility fallback
- improve queue telemetry (mode + queue depth + drift)
- better cache-busting and deployment observability

Long term:

- stronger end-to-end encrypted media key lifecycle
- robust low-bandwidth adaptation profiles
- policy tooling for operator-defined sovereignty defaults
