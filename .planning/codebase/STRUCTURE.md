# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```text
blossom-fire-demo/
├── .planning/              # Generated planning artifacts; currently contains codebase map docs
│   └── codebase/           # Codebase analysis documents such as this file
├── blob/                   # Minimal Node blob-storage service
├── relay/                  # Relay configuration mounted into nostr-rs-relay
├── tests/                  # Unit, Node E2E, and Playwright smoke tests
│   ├── e2e/                # Playwright spec files
│   └── unit/               # Vitest unit tests for shared helpers
├── web/                    # Static HTML entry points and shared browser modules
├── .gitignore              # Ignore rules for runtime data and local-only artifacts
├── docker-compose.yml      # Local service orchestration
├── package-lock.json       # NPM lockfile
├── package.json            # Package manifest and test scripts
├── playwright.config.js    # Playwright configuration
├── README.md               # Project overview and setup instructions
└── vitest.config.js        # Vitest configuration
```

## Directory Purposes

**`.planning/`:**
- Purpose: Planning and analysis output for the repository.
- Contains: Generated markdown under `.planning/codebase/`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.
- Subdirectories: `codebase/` only is present; no milestone or phase planning files were observed.

**`blob/`:**
- Purpose: Backend storage service for encrypted media payloads.
- Contains: A single Node module, `blob/server.js`.
- Key files: `blob/server.js` implements `/upload`, `/blob/:hash`, and `/health`.
- Subdirectories: None.

**`relay/`:**
- Purpose: Configuration for the local Nostr relay container.
- Contains: TOML config files.
- Key files: `relay/config.toml`.
- Subdirectories: None.

**`tests/`:**
- Purpose: Automated verification for helpers and end-to-end service behavior.
- Contains: `tests/unit/*.test.js`, the Node integration script `tests/e2e.mjs`, and Playwright specs under `tests/e2e/`.
- Key files: `tests/e2e.mjs`, `tests/e2e/smoke.spec.js`, `tests/unit/crypto.test.js`, `tests/unit/announcement.test.js`, `tests/unit/admin-gate.test.js`, `tests/unit/mse-pump.test.js`, `tests/unit/nip44wrap.test.js`.
- Subdirectories: `tests/unit/` for helper-level tests and `tests/e2e/` for browser smoke tests.

**`web/`:**
- Purpose: Static client application files served directly by Caddy in Docker.
- Contains: HTML entry points and small browser-side ES modules.
- Key files: `web/index.html`, `web/broadcast.html`, `web/admin.html`, `web/view.html`, `web/broadcast-video.html`, `web/view-video.html`, `web/util.js`, `web/crypto.js`, `web/blob.js`.
- Subdirectories: None; the directory is flat.

## Key File Locations

**Entry Points:**
- `web/index.html`: Demo landing page linking to admin, slideshow, and video flows.
- `web/broadcast.html`: Slideshow broadcaster entry point.
- `web/admin.html`: Admin allowlist and preview entry point.
- `web/view.html`: Slideshow viewer entry point.
- `web/broadcast-video.html`: Video broadcaster entry point.
- `web/view-video.html`: Video viewer entry point.
- `blob/server.js`: Blob HTTP server startup file.
- `tests/e2e.mjs`: Node-based end-to-end sanity runner.

**Configuration:**
- `package.json`: NPM metadata and test scripts.
- `docker-compose.yml`: Local topology for `relay`, `blob`, and `web` services.
- `relay/config.toml`: Relay binding and permissive authorization settings.
- `playwright.config.js`: Playwright test directory, base URL, and optional Docker bootstrapping.
- `vitest.config.js`: Vitest test include pattern and Node environment.
- `web/config.js`: Browser-side relay URL, blob base URL, tags, and demo admin key.
- `.gitignore`: Ignored runtime data and local artifacts.
- No `.env`, `Caddyfile`, or separate production config file exists in the repository snapshot.

**Core Logic:**
- `web/util.js`: Nostr keypair, signing, publish, subscribe, and NIP-44 helper functions.
- `web/crypto.js`: AES-GCM, SHA-256, UTF-8, and base64 helpers.
- `web/blob.js`: Browser wrapper for blob upload and fetch endpoints.
- `web/announcement.js`: Parsing helpers for public slideshow and video announcements.
- `web/admin-gate.js`: Pure helper for computing which viewers receive forwarded keys.
- `web/mse-pump.js`: Shared append-queue logic for Media Source playback.
- `blob/server.js`: Content-addressed blob persistence and retrieval.

**Testing:**
- `tests/unit/crypto.test.js`: Crypto helper coverage.
- `tests/unit/announcement.test.js`: Announcement parser coverage.
- `tests/unit/admin-gate.test.js`: Admin allowlist forwarding coverage.
- `tests/unit/mse-pump.test.js`: MSE queue helper coverage.
- `tests/unit/nip44wrap.test.js`: NIP-44 wrapper coverage.
- `tests/e2e/smoke.spec.js`: Playwright smoke checks for page boot and basic UI state.
- `tests/e2e.mjs`: Live relay/blob/NIP-44 roundtrip script.

**Documentation:**
- `README.md`: Architecture overview, quickstart, and test instructions.
- `.planning/codebase/ARCHITECTURE.md`: Conceptual architecture map.
- `.planning/codebase/STRUCTURE.md`: Physical structure map.
- No separate developer handbook, ADR directory, or API reference directory is present.

## Naming Conventions

**Files:**
- `*.html` in `web/`: page-level entry points named by role and mode, for example `web/admin.html` and `web/view-video.html`.
- kebab-case `*.js`: shared browser modules and tests, for example `web/admin-gate.js`, `web/mse-pump.js`, and `tests/unit/admin-gate.test.js`.
- `*.test.js`: Vitest unit tests under `tests/unit/`.
- `*.spec.js`: Playwright browser specs under `tests/e2e/`.
- Uppercase root markdown: `README.md` is the only project-level uppercase doc currently present.

**Directories:**
- Lowercase singular directories are used for runtime concerns: `blob/`, `relay/`, `web/`.
- `tests/` is plural and split by test type into `unit/` and `e2e/`.
- There is no feature-folder hierarchy under `web/`; browser files live in one flat directory.

**Special Patterns:**
- Browser pages import shared modules with relative paths such as `./util.js` and `./crypto.js`.
- Role-specific pages pair naturally by mode: `broadcast.html` with `view.html`, and `broadcast-video.html` with `view-video.html`.
- Generated planning documents live under `.planning/codebase/`.
- There is no `src/` directory, no `index.js` barrel pattern, and no generated client bundle checked into the repo.

## Where to Add New Code

**New Browser Feature:**
- Primary code: add or extend a page in `web/*.html` if the feature needs a new browser entry point, or add a helper in `web/*.js` if it is shared across pages.
- Tests: add helper-level coverage in `tests/unit/*.test.js`; add a browser smoke path in `tests/e2e/smoke.spec.js` or another spec under `tests/e2e/` if UI boot behavior matters.
- Config if needed: extend `web/config.js`; there is no separate environment-variable loader in the frontend.

**New Shared Module:**
- Implementation: `web/{feature-name}.js`.
- Types: no dedicated types directory exists; current codebase is plain JavaScript with inline JSDoc only where needed.
- Tests: `tests/unit/{feature-name}.test.js`.

**New Backend / Service Logic:**
- Definition: extend `blob/server.js` if the change belongs to blob storage, because there is no server-side module split yet.
- Handler/support code: if `blob/server.js` becomes too large, the repo currently has no established extraction directory; the nearest fit would still be additional modules under `blob/`.
- Tests: add service-level checks to `tests/e2e.mjs`; there are no backend-specific unit tests today.

**New Route / Command:**
- Browser route/page: add a new `web/{page-name}.html`.
- Server endpoint: add logic in `blob/server.js`.
- Tests: add Playwright coverage under `tests/e2e/` for browser routes or Node E2E coverage in `tests/e2e.mjs` for server endpoints.

**Utilities:**
- Shared browser helpers: `web/`.
- Test-only helpers: colocate under `tests/` if added; no dedicated `test-utils/` directory exists.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated codebase mapping documents.
- Source: Written by planning/mapping work rather than runtime code.
- Committed: Yes; `.gitignore` does not exclude `.planning/`.

**`data/`:**
- Purpose: Runtime relay and blob persistence mounted by `docker-compose.yml` as `./data/relay` and `./data/blobs`.
- Source: Created by local Docker runs, not stored in source control.
- Committed: No; `.gitignore` excludes `/data/`.

**`web/config.local.js`:**
- Purpose: Optional local-only override file name reserved in `.gitignore`.
- Source: Manual local development file if a contributor chooses to create it.
- Committed: No; the file is ignored and absent from the repository snapshot.

**`node_modules/`, `playwright-report/`, `test-results/`:**
- Purpose: Dependency install output and test artifacts.
- Source: Created by `npm install` and Playwright runs.
- Committed: No; all are ignored by `.gitignore`.

---

*Structure analysis: 2026-03-10*
*Update when directory structure changes*
