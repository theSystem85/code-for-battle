# Stable decoration page replacement

## Bug

- [x] **Keep unaffected decorations visible when buildings are placed** — track sprite-sheet dependencies per decorative chunk instead of globally re-keying every decoration page for every sprite publication, and retain the original visibility timestamp when an already-visible page is atomically replaced.
  - Spec: none

## Root cause

The decoration cache key included a renderer-wide asset generation that advanced for every streamed sprite publication. Building placement can demand and publish building/construction sprites, so an unrelated publication changed every decorative key and queued every visible decoration page for rebuilding. Publication then overwrote each page's readiness timestamp, causing the replacement page to restart the configured fade from alpha zero.

Decorative preparation now records the actual sprite-sheet paths drawn by each chunk in a bounded reverse dependency index. A tier publication invalidates only resident chunks that used that sheet. First publication still receives the configured fade; atomic replacements preserve the existing readiness timestamp and remain visible.

## Performance verification

Dependency collection reuses one set per bounded preparation entry and runs only during idle decoration preparation, not during the per-frame draw path. Publication work is bounded by resident pages that depend on the published asset. Hardware-backed 75 FPS acceptance remains pending on Patrick's qualifying GPU; no software-rendered GPU/FPS benchmark was run.
