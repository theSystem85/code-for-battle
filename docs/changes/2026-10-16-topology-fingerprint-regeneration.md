- [x] **Bug: sheet changes regenerate map topology**
  Fingerprint selected sheets, tags and cluster settings; restart single-player maps with the same seed, sync host topology before multiplayer starts, and preserve saved sheet metadata and topology on load with a mismatch notice.
  Spec: [Topology fingerprint regeneration](../specs/134-topology-fingerprint-regeneration.md)

Validation: 282 unit files / 5,071 tests passed; `npm run lint:fix:changed`, `npm run lint` and `git diff --check` passed. Browser regressions are implemented but verification is outstanding because the sandbox blocks Vite with `listen EPERM`.

- [x] **Bug: persisted integrated sheets at startup**
  Await saved optional sheet configuration before generating the initial world; record its fingerprint without regeneration, filter stale paths in sorted order, and preserve editor Apply/Close regeneration.
  Spec: [Topology fingerprint regeneration](../specs/134-topology-fingerprint-regeneration.md)

Startup regression coverage: `tests/e2e/integratedStartupSheets.test.js` enables optional sheets through localStorage at seed 23, size 96, checks integrated mode, city sheets and city buildings, and rejects sprite-sheet 404s, including a stale saved path.

Startup fix validation: all 282 unit files / 5,075 tests passed (68.26 s); `npm run lint:fix:changed`, `npm run lint`, and `git diff --check` passed. All three requested E2E files were invoked together but could not execute because the Vite server was denied its localhost listener (EPERM).
