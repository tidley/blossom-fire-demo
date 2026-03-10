# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- JavaScript (ES modules) - All application and test code in `web/*.js`, `blob/server.js`, `tests/**/*.js`, `tests/e2e.mjs`, `playwright.config.js`, and `vitest.config.js`
- HTML5 - Browser entrypoints in `web/*.html`

**Secondary:**
- CSS - Inline page styling in `web/*.html`
- TOML - Relay configuration in `relay/config.toml`
- YAML - Local container orchestration in `docker-compose.yml`

## Runtime

**Environment:**
- Modern browser runtime - The UI depends on native ES modules, Web Crypto, `fetch`, `localStorage`, `MediaRecorder`, `MediaSource`, and `navigator.mediaDevices` in files such as `web/util.js`, `web/crypto.js`, `web/broadcast.html`, and `web/view-video.html`
- Node.js 20 - The checked-in blob service runs in `node:20-alpine` via `docker-compose.yml`; `blob/server.js` uses `node:http`, `node:crypto`, `node:fs`, and `node:path`
- Containerized Nostr relay - `docker-compose.yml` runs `ghcr.io/scsibug/nostr-rs-relay:latest` with config from `relay/config.toml`

**Package Manager:**
- npm - `package.json` and `package-lock.json` are present
- Version is not pinned in repo; there is no `.nvmrc`, `.node-version`, or `engines` field in `package.json`

## Frameworks

**Core:**
- No frontend framework - The app is plain HTML plus browser modules under `web/`
- `nostr-tools` `^2.10.2` - Nostr relay access, key generation, event signing, NIP-19, and NIP-44 utilities; imported in Node tests from `package.json` and in the browser from `https://esm.sh/nostr-tools@2.10.2` inside `web/util.js`
- Caddy 2 - Static file server for `web/` in `docker-compose.yml`

**Testing:**
- Vitest `^3.2.4` - Unit tests configured by `vitest.config.js` and stored in `tests/unit/**/*.test.js`
- Playwright `^1.52.0` - Browser smoke tests configured by `playwright.config.js` and stored in `tests/e2e/smoke.spec.js`

**Build/Dev:**
- Docker Compose - Local orchestration for relay, blob server, and static web server in `docker-compose.yml`
- No bundler or transpiler - There is no `vite.config.*`, `webpack` config, `tsconfig.json`, or build script in `package.json`

## Key Dependencies

**Critical:**
- `nostr-tools` `^2.10.2` - Core protocol library for relay publish/subscribe, event signing, key generation, and NIP-44 encryption in `web/util.js` and `tests/e2e.mjs`
- Browser Web Crypto API - AES-GCM encryption, SHA-256 hashing, and random key generation in `web/crypto.js`
- Browser media APIs - Camera capture, recording, and playback pipeline in `web/broadcast.html`, `web/broadcast-video.html`, `web/view-video.html`, and `web/mse-pump.js`

**Infrastructure:**
- Node built-ins - The blob service in `blob/server.js` uses only standard library modules
- `ghcr.io/scsibug/nostr-rs-relay:latest` - External relay implementation container defined in `docker-compose.yml`
- `caddy:2` - Static hosting container for the browser app in `docker-compose.yml`

## Configuration

**Environment:**
- Browser endpoints are configured in `web/config.js` through `RELAYS`, `BLOB_BASE`, tag constants, and a checked-in `ADMIN_SK_HEX`
- Blob service configuration comes from `PORT` and `BLOB_DIR` in `blob/server.js`, with defaults overridden by `docker-compose.yml`
- Test configuration uses environment variables `RELAY` and `BLOSSOM` in `tests/e2e.mjs`, plus `DEMO_BASEURL`, `PW_NO_WEBSERVER`, and `CI` in `playwright.config.js`
- No `.env`, `.env.example`, or other checked-in env template files are present

**Build:**
- `package.json` - npm scripts for unit tests, watch mode, Node E2E, and Playwright
- `docker-compose.yml` - Local runtime topology
- `playwright.config.js` and `vitest.config.js` - Test runner configuration
- `relay/config.toml` - Relay runtime settings

## Platform Requirements

**Development:**
- Docker and Docker Compose are required for the default local stack in `docker-compose.yml`
- A modern desktop or mobile browser with secure-context media and crypto support is required for the interactive pages under `web/`
- No OS-specific code is checked in; the repo appears portable anywhere Docker, Node/npm, and a modern browser are available

**Production:**
- No checked-in production deployment manifest exists. `README.md` references `Caddyfile` and `docker-compose.prod.yml`, but those files are absent from the repository
- The implemented app assumes three network surfaces: static web hosting for `web/`, an HTTP blob service compatible with `blob/server.js`, and a WebSocket Nostr relay compatible with `RELAYS` in `web/config.js`

---

*Stack analysis: 2026-03-10*
*Update after major dependency changes*
