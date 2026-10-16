- [x] **Bug: source canvas import clicks**
  Handle clicks on the canvas itself, including non-bubbling events; retain transformed canvas bounds for source coordinates and the shared isolateAt status/placement path.
  Spec: none
- [x] **Bug regression coverage: ratio and extraction placement**
  Add controller regressions for default-ratio adjacent cells, rectangular ratio-scaled spans, and transformed source clicks; current packing already computes ceil(ceil(bbox * ratio) / tile) for borderless newSheet targets, equivalent to ceil(bbox * ratio / tile).
  Spec: none
- [ ] **Validation: SSE E2E fixes**
  Playwright intentionally not run per task constraint. Unit tests cannot start (Vitest missing); lint fails because only system ESLint 6.4.0 is available, which cannot load the repository flat config. lint:fix:changed was attempted but its npx invocation cannot resolve the missing local dependency offline. No simulation/render hot paths changed.
  Spec: none
