# Testing Patterns

**Analysis Date:** 2026-03-10

## Test Framework

**Runner:**
- Unit tests use Vitest `^3.2.4` from `package.json`.
- Vitest is configured in `vitest.config.js` with `environment: 'node'` and `include: ['tests/unit/**/*.test.js']`.
- Browser smoke tests use Playwright via `@playwright/test` `^1.52.0`, configured in `playwright.config.js`.
- A separate Node-based integration script exists at `tests/e2e.mjs`; it is not run by Vitest or Playwright.

**Assertion Library:**
- Vitest uses the built-in `expect` API in files such as `tests/unit/crypto.test.js`, `tests/unit/announcement.test.js`, and `tests/unit/mse-pump.test.js`.
- Playwright tests also use built-in `expect` from `@playwright/test` in `tests/e2e/smoke.spec.js`.
- Vitest mocking utilities come from `vi`, used in `tests/unit/mse-pump.test.js`.

**Run Commands:**
```bash
npm test                     # Runs Vitest once via "vitest run"
npm run test:unit           # Same as npm test
npm run test:watch          # Starts Vitest in watch mode
npx vitest run tests/unit/crypto.test.js
npm run test:e2e            # Runs the standalone Node integration script in tests/e2e.mjs
npm run test:e2e:pw         # Runs Playwright smoke tests
```

## Test File Organization

**Location:**
- Unit tests live under `tests/unit/`.
- Playwright smoke tests live under `tests/e2e/`.
- The standalone integration script is `tests/e2e.mjs` at the repo root of the `tests/` tree.

**Naming:**
- Unit tests follow `*.test.js`, for example `tests/unit/admin-gate.test.js` and `tests/unit/nip44wrap.test.js`.
- Playwright tests use `*.spec.js`, specifically `tests/e2e/smoke.spec.js`.
- There are no `*.integration.test.*` or `*.e2e.test.*` naming patterns in the repo.

**Structure:**
```text
tests/
  e2e/
    smoke.spec.js
  unit/
    admin-gate.test.js
    announcement.test.js
    crypto.test.js
    mse-pump.test.js
    nip44wrap.test.js
  e2e.mjs
```

## Test Structure

**Suite Organization:**
```javascript
describe('crypto helpers', () => {
  it('sha256Bytes returns 32 bytes', async () => {
    const h = await sha256Bytes(utf8Bytes('hello'));
    expect(h.length).toBe(32);
  });

  it('AES-GCM decrypt fails with wrong AAD', async () => {
    await expect(aesGcmDecrypt(key, iv, ciphertext, { aadBytes: aad2 })).rejects.toThrow();
  });
});
```

**Patterns:**
- Tests use top-level `describe()` blocks with focused `it()` cases.
- Setup is usually inline inside each test body. No shared `beforeEach`, `beforeAll`, `afterEach`, or `afterAll` hooks are present in the current test files.
- Arrange, act, assert is followed informally rather than via comments.
- Pure helper modules are tested directly through their public exports from `web/*.js`.
- Playwright tests are short smoke checks that navigate to a page and assert visible UI state in `tests/e2e/smoke.spec.js`.

## Mocking

**Framework:**
- Vitest's `vi` utilities are the only test-mocking framework in use.
- The repo does not use `vi.mock()` module mocking in the current tests.

**Patterns:**
```javascript
const appendBuffer = vi.fn();
const sourceBuffer = {
  updating: false,
  appendBuffer: (buf) => {
    appendBuffer(buf);
    sourceBuffer.updating = true;
  },
};
```

**What to Mock:**
- Small collaborator interfaces are stubbed inline when a pure helper needs them, such as the `sourceBuffer` object in `tests/unit/mse-pump.test.js`.
- Protocol adapters can be shimmed manually without a framework mock, such as the `nip44Shim` object in `tests/unit/nip44wrap.test.js`.

**What NOT to Mock:**
- Pure helper logic is usually exercised directly with real data structures like `Map`, `Uint8Array`, and JSON payloads.
- There is no evidence of mocking browser fetch, file system calls, or Nostr network calls inside unit tests, because those concerns are pushed into separate E2E checks instead.

## Fixtures and Factories

**Test Data:**
```javascript
const viewers = new Map([
  ['pubA', { allowed: true }],
  ['pubB', { allowed: false }],
  ['pubC', { allowed: true }],
]);

const ev = {
  kind: 1,
  tags: [['d', 'demo1'], ['i', '7'], ['x', 'abc123']],
};
```

**Location:**
- Shared fixture or factory directories do not exist.
- Test data is created inline inside each test file.
- There are no reusable helpers under `tests/fixtures/`, `tests/factories/`, or similar paths.

## Coverage

**Requirements:**
- No coverage threshold is declared.
- No CI enforcement for coverage is visible in the repo.

**Configuration:**
- There is no Vitest coverage config in `vitest.config.js`.
- There is no `test:coverage` script in `package.json`.
- No exclusions are configured because coverage reporting is not set up.

**View Coverage:**
```bash
# No coverage command is configured in this repo.
```

## Test Types

**Unit Tests:**
- Unit tests target pure or mostly pure helper modules in `web/`, including `web/crypto.js`, `web/announcement.js`, `web/admin-gate.js`, `web/mse-pump.js`, and `web/nip44wrap.js`.
- They run in Node via Vitest's `node` environment instead of a browser DOM environment.
- The emphasis is on deterministic behavior, protocol parsing, and small state transitions.

**Integration Tests:**
- `tests/e2e.mjs` is a lightweight integration script that hits a real blob service and relay using `RELAY` and `BLOSSOM` environment variables.
- It validates three end-to-end roundtrips: blob upload/fetch, relay publish/subscribe, and NIP-44 encrypt/decrypt.
- This script uses manual `throw new Error(...)` checks and `console.log()` output instead of a test framework reporter.

**E2E Tests:**
- Playwright covers page boot and basic UI readiness in `tests/e2e/smoke.spec.js`.
- `playwright.config.js` points `testDir` at `./tests/e2e`, defaults `baseURL` to `http://127.0.0.1:5173`, and starts local services with `docker compose up -d` unless `PW_NO_WEBSERVER` is set.
- The current E2E scope is intentionally light: landing page load plus slideshow and video viewer boot checks.

## Common Patterns

**Async Testing:**
```javascript
it('AES-GCM encrypt/decrypt roundtrip with 32-byte AAD', async () => {
  const { iv, ciphertext } = await aesGcmEncrypt(key, pt, { aadBytes: aad });
  const dec = await aesGcmDecrypt(key, iv, ciphertext, { aadBytes: aad });
  expect(new TextDecoder().decode(dec)).toBe(new TextDecoder().decode(pt));
});
```

**Error Testing:**
```javascript
it('AES-GCM decrypt fails with wrong AAD', async () => {
  await expect(aesGcmDecrypt(key, iv, ciphertext, { aadBytes: aad2 })).rejects.toThrow();
});
```

**Snapshot Testing:**
- Snapshot tests are not used anywhere in the repo.
- No `__snapshots__/` directories are present.

---

*Testing analysis: 2026-03-10*
*Update when test patterns change*
