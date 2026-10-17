- [x] **Bug: shore props and biome details**
  Load ungrouped shore props, prioritize deterministic coastline placement, require matching detail biomes, isolate terrain rocks from prop art, and verify footprint-based city HP.
  Spec: [Cliff stripes investigation](../../specs/133-cliff-stripes-investigation.md)
- [ ] **Bug investigation: reported cliff stripes**
  Code comparison and terrain-bucket guard are complete; live visual reproduction and qualifying-hardware performance checks remain outstanding.
  Spec: [Cliff stripes investigation](../../specs/133-cliff-stripes-investigation.md)
- [x] **Bug: sparse grass coast props**
  Attempt half of seeded land coast anchors, try larger shore sprites before 1x1 fallbacks, and allow adjacent shore footprints while retaining inland spacing and protected areas.
  Spec: none
  Validation: direct Node assertions cover density, determinism, land/water constraints and spacing. Full unit tests and lint were attempted but require missing local Vitest/ESLint dependencies; qualifying-hardware FPS remains unverified.
