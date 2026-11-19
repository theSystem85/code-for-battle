- [x] **Four-player replay state mismatch** — E00097 reaches recording/playback after awaiting UI binding. The 98.51% overlap came from visual code reading the simulation random generator and from fire repair timestamps using the wall clock. The 99% requirement stayed in place. Follow-up: [Fire audio and replay determinism](2026-11-19-fire-audio-and-replay.md).
  Spec: [Fire system](../../specs/fire-system.md)

Published as an explicit follow-up because the user requested pushing all current in-progress work with a finish-up prompt. The determinism threshold and assertions were not relaxed.
