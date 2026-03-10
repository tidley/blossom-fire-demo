# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Payment Processing:**
- None - No payment SDKs, billing APIs, or checkout flows are present in `package.json`, `web/`, `blob/`, or `tests/`

**Email/SMS:**
- None - No email or messaging providers are referenced in the repository

**External APIs:**
- Nostr relay - Public announcements, access requests, and encrypted DMs are exchanged over relay URLs from `RELAYS` in `web/config.js`
  - Integration method: `nostr-tools` `SimplePool` publish/subscribe in `web/util.js`
  - Auth: Nostr keypairs generated in-browser via `getOrCreateViewerKeypair()` in `web/util.js`; the admin key is a checked-in constant `ADMIN_SK_HEX` in `web/config.js`
  - Endpoints used: default relay URL is `ws://${location.hostname}:8080` from `web/config.js`; local relay container is defined in `docker-compose.yml`
- Blob host - Ciphertext blobs are uploaded and fetched over HTTP using the base URL in `BLOB_BASE` from `web/config.js`
  - Integration method: browser `fetch()` in `web/blob.js`; Node `fetch()` in `tests/e2e.mjs`
  - Auth: none implemented
  - Endpoints used: `POST /upload`, `GET /blob/:hash`, and `GET /health` as implemented by `blob/server.js`
- esm.sh CDN - Browser modules import `nostr-tools` directly from `https://esm.sh/nostr-tools@2.10.2` in `web/util.js`
  - Integration method: native browser ES module import
  - Auth: none
  - Availability impact: browser pages depend on this CDN unless the import is vendored or replaced

## Data Storage

**Databases:**
- None - No SQL, NoSQL, ORM, or migration tooling is present

**File Storage:**
- Local filesystem blob store - Raw encrypted payloads are stored under the directory set by `BLOB_DIR` in `blob/server.js`
  - SDK/Client: Node standard library only in `blob/server.js`
  - Auth: none
  - Storage path: `docker-compose.yml` mounts `./data/blobs` to `/data/blobs` inside the blob container

**Caching:**
- None - No Redis, Memcached, or in-process cache integration is present beyond transient in-memory `Map` objects in browser pages

## Authentication & Identity

**Auth Provider:**
- Custom Nostr identity - Viewers and broadcasters create or reuse local Nostr secret keys in `localStorage` through `getOrCreateViewerKeypair()` in `web/util.js`
  - Implementation: `generateSecretKey()`, `getPublicKey()`, `finalizeEvent()`, `nip19`, and `nip44` from `nostr-tools`
  - Token storage: browser `localStorage` keys such as `demo.viewer.sk` and `demo.broadcaster.sk`
  - Session management: none beyond persistent local key storage

**OAuth Integrations:**
- None - No OAuth providers, redirect flows, or credential env vars are present

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Rollbar, or similar service is configured

**Analytics:**
- None - No analytics SDKs or tracking calls are present

**Logs:**
- Container/stdout logging only - `blob/server.js` logs startup to stdout and `docker-compose.yml` sets `RUST_LOG=info` for the relay container
  - Integration: local process and container logs only; no centralized log service is configured

## CI/CD & Deployment

**Hosting:**
- Local Docker Compose stack - `docker-compose.yml` defines `relay`, `blob`, and `web` services
  - Deployment: manual `docker compose up -d`
  - Environment vars: inline in `docker-compose.yml` for the blob and relay services; browser configuration is hardcoded in `web/config.js`
- No production host configuration is checked in. `README.md` refers to `Caddyfile` and `docker-compose.prod.yml`, but those files are absent

**CI Pipeline:**
- No checked-in CI service - There is no `.github/workflows/`, GitLab CI file, or other pipeline configuration in the repository
  - Test entrypoints: `npm test`, `npm run test:e2e`, and `npm run test:e2e:pw` from `package.json`
  - Local automation: `playwright.config.js` can start the compose stack unless `PW_NO_WEBSERVER` is set

## Environment Configuration

**Development:**
- Required env vars: `PORT` and `BLOB_DIR` for `blob/server.js`; `RELAY` and `BLOSSOM` for `tests/e2e.mjs`; `DEMO_BASEURL`, `PW_NO_WEBSERVER`, and `CI` for `playwright.config.js`
- Secrets location: the only checked-in secret-like value is `ADMIN_SK_HEX` in `web/config.js`; viewer and broadcaster keys are stored in browser `localStorage`
- Mock/stub services: the default local development path is real local services from `docker-compose.yml`, not mocks

**Staging:**
- No staging environment configuration is present in the repository

**Production:**
- No production secrets management or failover configuration is checked in
- `README.md` describes external hostnames and HTTPS deployment, but the corresponding checked-in deployment files are not present

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints or callback handlers are implemented in `blob/server.js` or `web/`

**Outgoing:**
- None - The app publishes Nostr events to relays, but it does not send outbound webhooks to third-party HTTP endpoints

---

*Integration audit: 2026-03-10*
*Update when adding/removing external services*
