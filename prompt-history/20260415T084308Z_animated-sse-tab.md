# Prompt History
- UTC Timestamp: 2026-04-15T08:43:08Z
- Model: codex

## User Prompt
- The previous sprite-sheet animation changes were unsatisfactory.
- Animation is currently not visible.
- Integrate a new animation editor (Version B) into the existing Sprite Sheet Editor (Version A).
- Add tabs: `Static` for existing workflow and `Animated` for animation tagging workflow.
- Animated mode should use same inputs but animation-focused tags (default `explosion`, allow dynamic tags).
- Tagging defines frame sequences for potentially multiple animations in one sheet.
- Frame order must be left-to-right, top-to-bottom.
- Add animation preview in sidebar with loop checkbox, play/pause button, and duration display.
- Preview must follow currently selected radio-tag and auto-restart when tag changes.
- Sprite-sheet selector should list all assets under `public/images/map/animations`.
- Show per-frame sequence numbers as white labels at tile bottom-left and keep sequence numbering updated after edits.
- `Apply tags` must update runtime animation configuration instantly for game usage.
