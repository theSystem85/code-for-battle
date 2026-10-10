- [ ] **Bug: Movement and combat microstutters**
  Profile and remove repeated CPU searches and allocation churn; retain physical 75 FPS certification as outstanding until measured on qualifying hardware.
  Spec: [Movement and combat frame pacing](../../specs/2026-10-10-movement-combat-frame-pacing.md)
- [x] **Improvement: Measured CPU hot-path efficiency**
  Reuse AI defense snapshots, index the A* frontier, retain collision nodes and stopped-unit storage; add reproducible combat/traversal diagnostics and regression coverage.
  Spec: [Movement and combat frame pacing](../../specs/2026-10-10-movement-combat-frame-pacing.md)
- [x] **Bug: Scrolling alignment jiggle**
  Keep terrain, units, buildings, effects and GPU water in the same fractional camera coordinate system.
  Spec: [Movement and combat frame pacing](../../specs/2026-10-10-movement-combat-frame-pacing.md)
