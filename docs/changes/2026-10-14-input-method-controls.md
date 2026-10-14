- [x] **Feature: input-method onboarding and map panning**
  Add two-axis wheel panning and an explicit drag fallback, visual input-method onboarding with live bindings and retained progress, and localized controls documentation.
  Spec: [110 — Input-method controls and onboarding](../../specs/110-input-method-controls-and-onboarding.md)

- [x] **Bug: touch selling loses to waypoint selection**
  Route touch Sell/Repair taps to the active mode before selection/rally handling, suppress duplicate compatibility clicks, and keep the tutorial card within phone bounds.
  Spec: [110 — Input-method controls and onboarding](../../specs/110-input-method-controls-and-onboarding.md)

Validation: 4,845 unit tests, five Chromium browser scenarios, full lint and production build passed. Physical macOS Safari/Chrome trackpad verification remains open.
