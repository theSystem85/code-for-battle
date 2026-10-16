- [x] **Bugfix: deterministic SSE startup and imports**
  Publish the shared controller after initial sheet loading and layout, keep borders inside ratio-sized spans, and verify transformed source toggles and resize completion events.
  Spec: [Sprite Sheet Editor round 4](../../specs/sse-round4.md)
- [ ] **Verification: repeated browser coverage**
  Run the SSE E2E suite with `--repeat-each 2` outside this sandbox; Playwright is unavailable here.
  Spec: [Sprite Sheet Editor round 4](../../specs/sse-round4.md)
