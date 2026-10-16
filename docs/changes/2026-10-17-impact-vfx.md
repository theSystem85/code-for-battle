- [x] **Improvement: varied impact effects**
  Replace explosion rings with bounded pooled sparks, debris, embers, smoke and brief local light pulses; distinguish tank and M2 visual profiles without changing weapon stats.
  Spec: [Impact VFX variations](../../specs/impact-vfx-variations.md)
- [ ] **Improvement: qualifying hardware performance verification**
  Run before/after live scrolling and active combat measurements at the unchanged settings; this sandbox cannot launch the server or Chromium and cannot certify 75 FPS.
  Spec: [Impact VFX variations](../../specs/impact-vfx-variations.md)

Implemented: visual-only profile/direction/surface data at impact creation; randomized pooled sizes, shapes, angles, counts and lifetimes; reverse-cone sparks; tank dust chunks, embers and lingering smoke; small spark-heavy M2 aliases; ring removal; a cached additive 120–200 ms local brightness pulse; mobile/low-quality scaling; viewport/fog culling; reusable heavy-battle benchmark; unit coverage; version 0.59.0. Existing per-hit decal variant selection is retained.

Proposed only: refraction/true background blur, camera micro-shake and its settings UI, new decal rotation/scaling (requires terrain renderer changes), remote snapshot transport of visual metadata, and qualifying-hardware performance certification. No new M2 unit or gameplay configuration was added.

Validation: lint passed; all 5,039 unit tests and all 5,125 combined unit/integration tests passed. E2E and live benchmarking are blocked by missing Chromium and sandbox port restrictions. No commit was created.
