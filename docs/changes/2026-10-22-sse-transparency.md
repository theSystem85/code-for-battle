- [x] **Bug: SSE tag list layout**
  Keep tag rows and radio controls readable with a bounded scrolling list on desktop and mobile.
  Spec: none

- [x] **Feature: Alpha-based sprite extraction**
  Detect source transparency and isolate alpha contours for clicks and bulk extraction, preserving black detail and transparent holes; offer alpha cutoff, gap bridging and minimum component size.
  Spec: [SSE transparent source extraction](../../specs/048-sse-transparent-extraction.md)

- [x] **Bug: Transparent new sprite sheets**
  Create transparent canvases and preserve alpha through growth, editing, compaction, clearing and WebP export.
  Spec: [SSE transparent source extraction](../../specs/048-sse-transparent-extraction.md)

Validation: lint, production build, 5,381 unit tests, the combined 5,467 unit/integration tests, and 13 focused SSE/map Chromium browser tests pass. GPU performance acceptance remains pending on qualifying hardware; processing is event-driven and does not change the gameplay render loop.
