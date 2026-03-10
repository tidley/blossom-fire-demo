# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Inline page scripts duplicate the stream protocol across five entrypoints:**
- Issue: The core Nostr/blob/crypto flow is implemented separately inside `web/broadcast.html`, `web/broadcast-video.html`, `web/view.html`, `web/view-video.html`, and `web/admin.html` instead of being centralized in shared modules.
- Why: The repository is explicitly a proof-of-concept in `README.md`, and the UI pages were built quickly as standalone demos.
- Impact: Protocol fixes need to be repeated in multiple places, and behavior has already drifted. For example, `web/admin-gate.js` and `tests/unit/admin-gate.test.js` cover a shared forwarding helper, but `web/admin.html` still has its own inline forwarding logic.
- Fix approach: Move announcement parsing, DM validation, key forwarding, and stream-state handling into shared modules used by all pages.

**Tested helper modules do not match the runtime paths that users execute:**
- Issue: `web/announcement.js` and `web/admin-gate.js` are unit-tested, but `web/view.html`, `web/view-video.html`, and `web/admin.html` manually parse events and build forwarding payloads instead of calling those helpers.
- Why: Helpers were added after the browser pages already existed.
- Impact: The most important runtime code paths can regress while unit tests stay green, because the tests exercise abstractions the pages do not actually use.
- Fix approach: Refactor the pages to import the helper modules directly, then keep tests attached to the shared code rather than duplicate inline implementations.

**Runtime dependencies are split between npm and a CDN bundle:**
- Issue: Browser code in `web/util.js` imports `nostr-tools` from `https://esm.sh/nostr-tools@2.10.2`, while tests and local tooling use the npm package declared in `package.json`.
- Why: ESM CDN imports are the fastest way to prototype browser-only pages without a bundler.
- Impact: Runtime behavior can diverge from local test behavior, especially because `web/util.js` already contains compatibility fallbacks for multiple `SimplePool` subscription APIs.
- Fix approach: Bundle browser dependencies locally or serve a pinned vendored browser build from the repo so runtime and test environments use the same artifact.

## Known Bugs

**Slideshow broadcast can overlap async frame sends and reuse frame IDs:**
- Symptoms: The broadcaster can publish duplicate or out-of-order slideshow frames if encryption/upload/publish takes longer than the chosen interval.
- Trigger: Run `web/broadcast.html` at a higher FPS or on a slow network/device so one `tick()` call has not finished before the next `setInterval()` firing.
- Workaround: Keep FPS low and network local; there is no in-code lock preventing overlap.
- Root cause: `web/broadcast.html` starts an async `tick()` on `setInterval()` and also calls `tick()` immediately, but `frameId` is mutated only after the awaited upload/publish sequence completes.
- Blocked by: No shared scheduler or single-flight guard exists for the slideshow sender.

**The documented production quickstart references files that are not in the repository:**
- Symptoms: Following the deployment steps in `README.md` fails because the repo does not contain the referenced `Caddyfile` or `docker-compose.prod.yml`.
- Trigger: Try to execute the “Quickstart (VPS, HTTPS)” section in `README.md`.
- Workaround: Use `docker-compose.yml` as a starting point and create the missing production files manually.
- Root cause: Documentation moved ahead of the checked-in deployment assets.
- Blocked by: The repository currently ships only `docker-compose.yml` and static `web/` assets.

## Security Considerations

**Shared demo admin private key is committed in client-side code:**
- Risk: `web/config.js` exports `ADMIN_SK_HEX = "1".repeat(64)`, so anyone with the repo or served frontend can know the admin secret and impersonate the admin identity.
- Current mitigation: `README.md` labels this as a demo-only secret and says to replace it before non-LAN use.
- Recommendations: Remove private keys from shipped client assets, provision admin identity out-of-band, and treat broadcaster/admin keys as environment-specific secrets rather than source-controlled constants.

**Viewer and broadcaster private keys are persisted in browser localStorage:**
- Risk: `web/util.js` stores long-lived keys in `localStorage` (`demo.viewer.sk` and `demo.broadcaster.sk`), which exposes them to XSS, shared-browser reuse, and local machine compromise.
- Current mitigation: The repo only documents this as a POC limitation in `README.md`; no code-level hardening is present.
- Recommendations: Use short-lived session keys, device pairing, or a wallet/extension signer flow instead of raw secret-key storage in the app.

**Admin and viewer message handlers do not authenticate trusted senders:**
- Risk: `web/admin.html` accepts any decryptable kind-4 DM matching the stream ID and forwards its key material to allowed viewers, and `web/view.html` / `web/view-video.html` accept any decryptable DM matching the stream ID without verifying the sender against a trusted admin/broadcaster identity.
- Current mitigation: Encryption prevents passive relay observers from reading DMs, but it does not prove that the sender is an approved broadcaster/admin for that stream.
- Recommendations: Introduce an explicit trust model per stream, pin authorized pubkeys, and reject DMs from untrusted senders before forwarding or rendering.

**Blob and relay services are intentionally open to the network:**
- Risk: `blob/server.js` allows unrestricted upload/download with `access-control-allow-origin: *`, and `relay/config.toml` sets `messages_per_sec = 0`, `subscriptions_per_min = 0`, and empty whitelists.
- Current mitigation: The repo describes this as a LAN/demo setup; there is no authentication, rate limiting, or quota enforcement in code.
- Recommendations: Add auth, per-stream authorization, rate limits, upload quotas, and origin restrictions before exposing these services outside a tightly controlled environment.

## Performance Bottlenecks

**Blob uploads and reads are fully buffered and use synchronous filesystem APIs:**
- Problem: `blob/server.js` buffers the entire upload into memory, hashes it, and then uses `writeFileSync` / `readFileSync` for persistence and retrieval.
- Measurement: No throughput or latency measurements are checked into this repo.
- Cause: The blob server is a minimal single-file demo implementation optimized for simplicity.
- Improvement path: Stream request bodies to disk, avoid synchronous file operations on the request path, and add basic backpressure/size limits.

**Video chunk production pays repeated recorder start/stop overhead:**
- Problem: `web/broadcast-video.html` recreates a `MediaRecorder` for every chunk so each blob is self-contained for late joiners.
- Measurement: No chunk latency, dropped-frame, or CPU measurements are present in the repo.
- Cause: The code prioritizes self-contained chunks and simpler viewer playback over continuous recording efficiency.
- Improvement path: Measure chunk cadence under load, consider a continuous recorder with explicit initialization segments, and move chunking policy behind a tested abstraction.

## Fragile Areas

**Nostr protocol handling is spread across inline browser code with partial validation:**
- Why fragile: Announcement parsing, DM parsing, and forwarding rules are duplicated across `web/admin.html`, `web/view.html`, `web/view-video.html`, `web/broadcast.html`, and `web/broadcast-video.html`, while stricter parsers in `web/announcement.js` are not used by the runtime pages.
- Common failures: One page can accept malformed or incomplete events that another page rejects, or a protocol change can be applied in one HTML file and missed in the others.
- Safe modification: Change the stream/event schema only after extracting shared parsing and validation into imported modules, then update every page to use those modules.
- Test coverage: Only helper modules such as `web/announcement.js` are unit-tested; the inline page implementations are not directly exercised.

**Relay publish/subscribe behavior depends on optimistic best-effort timing:**
- Why fragile: `web/util.js` uses whichever `SimplePool` subscription API exists at runtime and treats publish success as “at least one OK or a 1.2s timeout,” with no durable ack, reconnect, dedupe, or backfill strategy.
- Common failures: Slow relays or API differences can look like successful publishes even when downstream pages never observe the event, and intermittent relay behavior is hard to diagnose from the UI.
- Safe modification: Keep relay behavior behind one shared transport module, add explicit logging/ack semantics, and test against the exact browser runtime artifact rather than only the npm package.
- Test coverage: `tests/e2e.mjs` checks a minimal publish/subscribe roundtrip, but there are no automated tests for reconnects, relay delays, duplicate events, or multi-relay behavior.

## Scaling Limits

**Relay and blob services currently scale only as far as the host can absorb abuse:**
- Current capacity: No formal capacity numbers are defined in code; `relay/config.toml` disables rate limits entirely and `docker-compose.yml` stores blobs on the host filesystem under `./data/blobs`.
- Limit: Relay spam, subscription fan-out, or disk growth will eventually exhaust CPU, memory, sockets, or storage because no quotas or cleanup exist.
- Symptoms at limit: Upload latency rises, relay responsiveness degrades, and disk usage grows without bound.
- Scaling path: Add rate limits, auth, quotas, retention policies, observability, and capacity tests before treating this as anything beyond a demo.

**Browser memory usage grows with stream duration:**
- Current capacity: Not documented; `web/admin.html` keeps `viewers`, `adminFrameKeys`, and video preview state in memory, while `web/view-video.html` keeps `keys` and `announced` maps without pruning.
- Limit: Long-running streams or many viewers will increase browser memory use and page-state churn over time.
- Symptoms at limit: Slower UI updates, heavier GC pauses, and eventual tab instability on constrained devices.
- Scaling path: Prune old metadata aggressively, persist only what is needed for current playback, and establish stream/session retention rules.

## Dependencies at Risk

**`ghcr.io/scsibug/nostr-rs-relay:latest`:**
- Risk: `docker-compose.yml` tracks the floating `latest` tag, so relay behavior can change underneath the repo without a code change.
- Impact: Local and production-like environments can drift, especially around relay config semantics or NIP support.
- Migration plan: Pin a tested image digest or version tag and update it intentionally after compatibility verification.

**`https://esm.sh/nostr-tools@2.10.2`:**
- Risk: Browser runtime depends on an external CDN transform in `web/util.js`; availability, caching, or generated bundle differences can break the app independently of `package-lock.json`.
- Impact: Browser pages can fail to load or behave differently from tests that import the npm package directly.
- Migration plan: Vendor or bundle the browser dependency locally and test the shipped artifact, not just the source import.

## Missing Critical Features

**Stream-level trust and authorization model:**
- Problem: The repo has no concept of “trusted broadcaster for stream X” or “trusted admin for stream X”; the pages operate on stream IDs and public relay traffic alone.
- Current workaround: Operators must rely on manual coordination and LAN/demo assumptions.
- Blocks: Secure multi-user deployment, dependable moderation, and any serious access-control claims beyond “keys are only sent to people we toggled on.”
- Implementation complexity: Medium; requires explicit identity binding, stream metadata, and sender verification in the client protocol.

**Operational deployment assets matching the README:**
- Problem: The HTTPS/VPS instructions in `README.md` refer to production files that are not checked in.
- Current workaround: Build equivalent deployment config manually from `docker-compose.yml` and the prose instructions.
- Blocks: Reproducible deployment and onboarding for anyone who expects the documented production path to work as written.
- Implementation complexity: Low to Medium; mostly packaging and documentation work, but it needs to be tested end-to-end.

## Test Coverage Gaps

**Inline browser page logic is mostly untested:**
- What's not tested: The actual scripts inside `web/admin.html`, `web/broadcast.html`, `web/broadcast-video.html`, `web/view.html`, and `web/view-video.html` are not unit-tested as modules.
- Risk: Regressions in key forwarding, announcement parsing, sender validation, and UI state can slip through while helper-only tests continue to pass.
- Priority: High
- Difficulty to test: Medium; the logic needs to be extracted from HTML into importable modules or exercised with browser-level integration tests.

**Browser E2E coverage stops at page boot and basic status text:**
- What's not tested: `tests/e2e/smoke.spec.js` verifies that pages load and show initial UI, but it does not run camera capture, encrypted blob upload, admin allowlisting, DM forwarding, decryption, or video playback.
- Risk: The core user journey can break without any automated browser test failing.
- Priority: High
- Difficulty to test: High; it requires controllable media fixtures, relay/blob orchestration, and deterministic stream playback assertions.

**No automated coverage for blob server error handling or resource limits:**
- What's not tested: `blob/server.js` has no direct tests for large uploads, invalid methods, concurrent requests, disk errors, or CORS/security behavior.
- Risk: The service can fail under load or hostile input in ways that are invisible to the current unit suite.
- Priority: Medium
- Difficulty to test: Medium; add server-level integration tests that start the blob service locally and exercise unhappy paths.

**No checked-in CI workflow enforces the existing tests:**
- What's not tested: The repo contains `package.json`, `vitest.config.js`, and `playwright.config.js`, but no GitHub Actions or other CI workflow files were found in the repository.
- Risk: Test health depends on developers remembering to run commands manually, so regressions can land unnoticed.
- Priority: Medium
- Difficulty to test: Low; add a CI workflow that runs unit tests and smoke tests in a known environment.

---

*Concerns audit: 2026-03-10*
*Update as issues are fixed or new ones discovered*
