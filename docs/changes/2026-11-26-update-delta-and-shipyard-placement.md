# Bugfixes

- [x] **Live update note deltas**
  Compare with the installed build's notes so the in-game notice only lists newly added changes.
  Spec: none
- [x] **Shipyard placement preview**
  Require coastal contact for a green Shipyard preview and validate chained Shipyard previews before accepting the blueprints.
  Spec: [Shipyard Coastal Placement](../../specs/101-shipyard-coastal-placement.md)

## Verification

- All 6,138 unit and integration assertions passed across 409 files. Vitest also reported two unhandled remote-control initialization errors from the enemy-AI test setup.
- Targeted Chromium update and production gesture tests passed after integrating the current dev changes.
- A browser click check confirmed offshore placement stays orange and is rejected, while the coastal footprint is fully green and builds successfully.
- The broader Chromium run stopped on an external-resource ERR_TUNNEL_CONNECTION_FAILED error. Remaining browser coverage and hardware GPU performance acceptance are pending.
