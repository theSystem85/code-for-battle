- [x] **Compact-save export metadata and replay test readiness** — Decode compact saves once before selecting download label/date, and make the replay browser test await its actual UI binding before clicking Record.
  Spec: none

The rebased dev browser checks exposed an existing compact-save download named `unknown-date_save.cfb`. Replay recording could be invoked directly, but its browser test clicked before `initReplaySystem` bound the visible button; the replay and save/import/export tests now await that explicit readiness marker and retains its recording/determinism assertions.
