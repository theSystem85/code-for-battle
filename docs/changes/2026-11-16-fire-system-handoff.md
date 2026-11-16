- [x] **Fire-system handoff** — Publish the current implementation to dev and document the remaining audio, artwork, integration acceptance and hardware checks.
  Spec: [Fire system](../../specs/fire-system.md)

Publication validation on rebased dev:

- `npm run test -- --maxWorkers=1`: 5,950 passed; one existing soil-atlas alpha failure was reproduced, corrected by regenerating the atlas and dependent tiers, then all 18 source-profile cases passed unchanged.
- Focused save/format/replay unit run: 49 passed after fixing compact-export filename metadata.
- System Chromium browser checks: E00262 (fire) and E00102 (save/import/export) passed together after explicit UI-readiness waits.
- E00097 reaches recording/playback but fails the unchanged 99% state-overlap threshold at 98.51%; recorded in the handoff and its own open follow-up note. The user explicitly requested publishing the current in-progress work with completion instructions.
- Full remaining Playwright coverage and verified-hardware 75 FPS acceptance were not run. No software-GPU performance certification is claimed.

The completion prompt is `docs/fire-system-handoff.md`. Generated audio download/integration, reviewed artwork, the replay mismatch, full multiplayer acceptance and hardware verification remain open.

Final publication lint, test-ID validation, production build and prepared map-tier verification passed. The replay mismatch above remains open and is not represented as a passing check.
