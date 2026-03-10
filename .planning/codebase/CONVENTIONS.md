# Coding Conventions

**Analysis Date:** 2026-03-10

## Naming Patterns

**Files:**
- Lowercase file names are used throughout the repo. JavaScript modules in `web/` use simple names like `web/blob.js`, `web/crypto.js`, and `web/admin-gate.js`.
- Multi-word files use kebab-case in both app code and tests, for example `web/mse-pump.js`, `web/nip44wrap.js`, `tests/unit/admin-gate.test.js`, and `tests/e2e/smoke.spec.js`.
- HTML pages are named by role or flow, such as `web/admin.html`, `web/view.html`, `web/broadcast.html`, and the `-video` variants.
- Config files follow tool defaults rather than a repo-specific naming scheme: `vitest.config.js` and `playwright.config.js`.

**Functions:**
- Functions use camelCase names, including exported helpers like `aesGcmEncrypt`, `computeForwardKeyPayloads`, `parseVideoChunkAnnouncement`, and `createPump`.
- Async functions do not use an `Async` suffix or prefix. Examples include `blobUpload` in `web/blob.js`, `publish` in `web/util.js`, and `tryRender` in `web/view.html`.
- UI and event-oriented functions use imperative verb names such as `setStatus`, `renderViewers`, `setupCamera`, `ensureVideoMse`, and `tryDecryptVideoChunk` in the inline module scripts under `web/*.html`.
- Boolean-like state names are descriptive rather than prefixed with `is` everywhere; examples include `running`, `seen`, and `allowed`.

**Variables:**
- Local variables use camelCase in both browser and Node code: `streamId`, `blobHash`, `keyBytes`, `videoLastAppended`, and `sourceBuffer`.
- Constants that represent environment or fixed configuration use UPPER_SNAKE_CASE, for example `PORT` and `BLOB_DIR` in `blob/server.js`, plus `RELAYS`, `BLOB_BASE`, `ADMIN_SK_HEX`, `TAG_DEMO`, and `TAG_REQ` in `web/config.js`.
- Collections are usually plural nouns or data-shape names such as `viewers`, `keys`, `announced`, `videoKeys`, and `videoDecrypted`.
- No underscore prefix or other private-member marker is used.

**Types:**
- The project is plain JavaScript with ESM enabled by `"type": "module"` in `package.json`; there are no TypeScript source files.
- There are no interfaces, type aliases, or enums in the repo.
- JSDoc is used selectively to describe object shapes on pure helpers, notably in `web/admin-gate.js` and `web/mse-pump.js`.

## Code Style

**Formatting:**
- No formatter config is present. There is no `.prettierrc`, `prettier.config.*`, or equivalent file in the repo root.
- Indentation is 2 spaces in JavaScript, HTML, and CSS across files such as `web/view.html`, `blob/server.js`, and `tests/unit/crypto.test.js`.
- Semicolons are used consistently in both source and tests.
- Quote style is mixed by file. Browser-facing modules and tests commonly use single quotes in files like `web/admin-gate.js` and `tests/unit/*.test.js`, while `blob/server.js`, `web/crypto.js`, `web/util.js`, and `tests/e2e.mjs` use double quotes. Because no formatter is configured, matching the local file style is the safest convention.
- No line-length rule is declared anywhere in the repo.

**Linting:**
- No lint config is present. There is no `eslint.config.js`, `.eslintrc*`, or package script for linting.
- Since no linter is configured, conventions are inferred from existing files rather than enforced automatically.

## Import Organization

**Order:**
1. ESM imports are used everywhere, including browser modules in `web/*.js`, inline `<script type="module">` blocks in `web/*.html`, Node code in `blob/server.js`, and test files under `tests/`.
2. External package imports generally appear before local imports, for example in `web/util.js`, `tests/unit/nip44wrap.test.js`, and `playwright.config.js`.
3. Relative imports use explicit file extensions, such as `./config.js` and `../../web/crypto.js`.
4. Default exports are rare and mainly reserved for tool config files like `vitest.config.js` and `playwright.config.js`.

**Grouping:**
- Blank lines between import groups are used sometimes, but there is no rigid rule. `web/util.js` has one blank line between the remote `nostr-tools` import and local imports.
- Import declarations are not strictly kept at the very top in every file. `web/util.js` declares `import { RELAYS } from "./config.js";` after helper functions, which indicates that strict import ordering is not being enforced by tooling.
- Inline module scripts in `web/view.html`, `web/admin.html`, `web/broadcast.html`, `web/view-video.html`, and `web/broadcast-video.html` import small shared helpers from `web/*.js` and keep page orchestration in the HTML file itself.

**Path Aliases:**
- No path aliases are configured.
- All internal imports are relative paths.

## Error Handling

**Patterns:**
- Small helper modules use guard clauses and throw plain `Error` instances for invalid input, for example `computeForwardKeyPayloads` in `web/admin-gate.js`, `createPump` in `web/mse-pump.js`, and the fetch wrappers in `web/blob.js`.
- Async UI code usually catches errors near event or subscription boundaries, then updates status text or logs to the console. Examples appear in the subscription callbacks in `web/view.html` and `web/admin.html`.
- Network wrappers throw on non-OK responses, such as `blobUpload` and `blobFetch` in `web/blob.js`.
- Parsing helpers prefer structured return objects over exceptions for expected invalid cases, for example `parseVideoChunkAnnouncement` and `parseImageFrameAnnouncement` in `web/announcement.js` return `{ ok: false, reason }`.

**Error Types:**
- There are no custom error classes anywhere in the repo.
- Plain `Error` is used for missing arguments, invalid input, and failed HTTP responses.
- Expected non-fatal browser failures are often swallowed or downgraded to status updates, such as the DM decrypt catch in `web/view.html` and preview warnings in `web/admin.html`.

## Logging

**Framework:**
- No logging library is used.
- The repo uses `console.log`, `console.error`, and `console.warn` directly.

**Patterns:**
- Node entrypoints log lifecycle information to stdout, for example `blob/server.js` logs startup and `tests/e2e.mjs` logs `OK` and `FAIL` messages.
- Browser pages log exceptional paths and debugging details while also updating visible UI state through `setStatus`, for example in `web/admin.html`, `web/view.html`, and `web/view-video.html`.
- Logging is concentrated at boundaries such as startup, media operations, decryption failures, and fetch/subscription callbacks rather than in every helper.

## Comments

**When to Comment:**
- Comments are short and practical, usually explaining protocol expectations, data shapes, or browser quirks rather than restating the code.
- Examples include the pure-helper intent in `web/admin-gate.js`, compatibility notes in `web/util.js`, MSE notes in `web/mse-pump.js`, and route descriptions in `blob/server.js`.
- Inline scripts in `web/admin.html` and `web/view.html` use comments to separate phases like subscription setup, preview handling, and key forwarding.

**JSDoc/TSDoc:**
- JSDoc is present but limited to functions where parameter and return shapes would be hard to infer quickly, such as `computeForwardKeyPayloads` in `web/admin-gate.js` and `createPump` in `web/mse-pump.js`.
- There is no project-wide requirement for JSDoc on every function.

**TODO Comments:**
- No `TODO` or `FIXME` comments were found in the tracked source and test files.
- There is no observed username or issue-link format for deferred work comments because none are present.

## Function Design

**Size:**
- Shared modules in `web/*.js` favor small, single-purpose helpers.
- Larger imperative flows stay inside the page-level module scripts in `web/admin.html`, `web/view.html`, `web/broadcast.html`, `web/view-video.html`, and `web/broadcast-video.html`.

**Parameters:**
- Simple helpers use positional parameters, for example `blobFetch(hash)` in `web/blob.js` and `parseImageFrameAnnouncement(ev, streamId)` in `web/announcement.js`.
- Functions with optional behavior or several related settings use an options object, for example `aesGcmEncrypt(..., { aadBytes })` in `web/crypto.js` and `createPump(opts)` in `web/mse-pump.js`.
- Data-heavy functions often accept records or maps instead of many discrete arguments, as seen in `computeForwardKeyPayloads(viewers, keyMsg)` in `web/admin-gate.js`.

**Return Values:**
- Helpers return plain objects or primitive-friendly values instead of classes. Examples include `{ iv, ciphertext }` from `web/crypto.js` and `{ ok, reason }` style parsing results from `web/announcement.js`.
- Early returns are used heavily to short-circuit invalid state, missing DOM prerequisites, unsupported browser APIs, and empty work queues.

## Module Design

**Exports:**
- Shared application code uses named exports in files under `web/`.
- Default exports are used for config entrypoints only, specifically `vitest.config.js` and `playwright.config.js`.
- Browser pages import helper modules and keep DOM orchestration inline rather than exporting page controllers as separate modules.

**Barrel Files:**
- No barrel files or `index.js` re-export modules are present.
- Modules are imported directly from their concrete file paths.

---

*Convention analysis: 2026-03-10*
*Update when patterns change*
