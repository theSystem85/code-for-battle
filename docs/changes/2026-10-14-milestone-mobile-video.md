- [x] **Bug: Mobile milestone video presentation**
  Use native inline video compositing, playing-triggered 400ms opacity fades, delayed cleanup, and compact top-left placement in collapsed/condensed portrait layouts; expanded layouts follow the minimap.
  Spec: none

Video elements use muted inline autoplay (including webkit-playsinline) and auto preload. Preloaded video elements are adopted without reloading; equivalent URL retries and cleanup load calls are removed. Existing soundtrack policy remains in effect, including muted fallback when audible autoplay is denied. Static known letterbox crops use CSS sizing without per-frame layout changes. No media was re-encoded: iOS hardware decoding can still depend on MP4 codec/profile/level, frame rate and bitrate; H.264/AAC compatibility and actual-device playback should be checked if stutter persists.

The native compositor avoids copying a video frame to the high-DPI minimap canvas each game render. Placement reads occur on playback and layout notifications, not every frame. The existing single audio fade callback remains allocation-free; no simulation or renderer loop was changed. Unknown clip crops retain their original frame rather than invoking canvas pixel detection during playback.

Verification: focused Vitest coverage checks placement, inline playback attributes and delayed fade cleanup. Real iOS Safari smoothness and the qualifying-hardware 75 FPS gate remain outstanding: this sandbox cannot certify device presentation or GPU performance. No visual fidelity/settings reductions were introduced.

Test runner repair: Vitest now discovers unit/integration files only; Playwright files remain owned by the existing test:e2e script. Previously npm test attempted to execute Playwright suites inside Vitest. The release-loading count assertion includes this release's additional bugfix.

Completed checks:
- `npm run lint:fix:changed` and `npm run lint`: passed.
- `npm run test:unit`: 258 files, 4,878 tests passed.
- `npm test`: 260 files, 4,964 tests passed.
- `git diff --check`: passed.

Dependencies were restored from the offline npm cache with `npm ci --offline --ignore-scripts` after the esbuild install-time binary validation was denied by the sandbox. No network access or media conversion was used.
