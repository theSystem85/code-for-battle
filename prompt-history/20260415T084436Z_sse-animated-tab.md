# Prompt History
- UTC Timestamp: 2026-04-15T08:44:36Z
- Model: codex

## User Prompt
Follow-up request after previous PR:

- Animation is not visible anymore.
- Integrate animation sprite-sheet editing directly into existing Sprite Sheet Editor.
- Keep current editor as Version A under a `Static` tab.
- Add Version B under an `Animated` tab.
- Animated tab uses same core inputs but animation tags (default `explosion`, with dynamic add).
- Tags define animation sequences for frames on a shared sheet (LTR/top-to-bottom indexing).
- Add animation preview at top of sidebar with:
  - loop checkbox
  - play/pause button
  - duration display based on tagged sequence
- Preview must follow selected tag in radio list and restart on tag change.
- Sprite sheet selector in Animated mode should show assets from `public/images/map/animations`.
- Show frame numbers for animation sequence tiles as small white labels at bottom-left.
- Recompute sequence labels whenever sequence changes.
- On `Apply tags`, apply animation JSON instantly to game runtime.
