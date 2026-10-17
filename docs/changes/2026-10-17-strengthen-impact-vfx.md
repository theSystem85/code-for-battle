- [x] **Bug: weak tank blasts and incorrect Bradley impact profile**
  Resolve visual profiles from unit configuration, enlarge tank blasts, brighten directional Bradley sparks and distinguish ground debris from metal impacts without changing gameplay.
  Spec: [Impact VFX variations](../../specs/impact-vfx-variations.md)
- [ ] **Improvement: visual and performance acceptance**
  Verify close-up appearance and before/after 75 FPS on qualifying hardware; local server binding and browser launch are blocked.
  Spec: [Impact VFX variations](../../specs/impact-vfx-variations.md)

Validation: changed-file lint fixing and full lint passed; 5,045 unit tests and 5,131 combined unit/integration tests passed. The tank config alias preserves roster enumeration. Version remains 0.59.0; no commit created. Visual and qualifying-hardware performance acceptance remain open.
