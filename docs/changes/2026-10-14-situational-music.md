- [x] **Feature: Situational music director**
  Local background music responds to first combat, outnumbered attacks and impending defeat, with sequential fade-out transitions (no overlap, no fade-in) and simulation-time hysteresis.
  Spec: [Situational music director](../../specs/2026-10-14-situational-music.md)
- [ ] **Improvement: Reference hardware performance certification**
  Complete the unchanged-quality 75 FPS before/after protocol on qualifying hardware; sandbox CPU diagnostics cannot certify presented FPS.
  Spec: [Situational music director](../../specs/2026-10-14-situational-music.md)
- [x] **Assets: three situational music tracks**
  Added `music_attack_motivational.mp3`, `music_under_attack_danger.mp3` and `music_defeat_sad.mp3` (instrumental, ElevenLabs Music v2.5, 3:00 each, 160 kbps / 48 kHz, about -12 LUFS). Credits and the ElevenLabs Starter commercial license are listed in `docs/ASSET_CREDITS.md`.
- [x] **Fix: no music overlap and no sad track at game start**
  Track switches now fade the current song out completely (3.5 s) before the next one starts at full volume without a fade-in. Near defeat requires a once-owned construction yard or refinery and at least 3 minutes of game time, so the normal playlist always plays at the start.
  Spec: [Situational music director](../../specs/2026-10-14-situational-music.md)
