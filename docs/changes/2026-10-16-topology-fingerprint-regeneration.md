- [x] **Bug: sheet changes regenerate map topology**
  Fingerprint selected sheets, tags and cluster settings; restart single-player maps with the same seed, sync host topology before multiplayer starts, and preserve saved sheet metadata and topology on load with a mismatch notice.
  Spec: [Topology fingerprint regeneration](../specs/134-topology-fingerprint-regeneration.md)

Validation: 282 unit files / 5,071 tests passed; `npm run lint:fix:changed`, `npm run lint` and `git diff --check` passed. Browser regressions are implemented but verification is outstanding because the sandbox blocks Vite with `listen EPERM`.
