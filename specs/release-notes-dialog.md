# Full release notes dialog

## Goal

Make the complete, bundled release history available from the bottom of the left sidebar without creating a second changelog source.

## Requirements

- Use the merged `releaseEntries` data shared by loading and live-update release digests.
- Present keyboard-accessible Index and Releases tabs in a responsive modal.
- Index every release and its categorized entries with stable local anchors.
- Selecting an index entry switches to Releases and scrolls the matching section into view.
- Close on the close control, backdrop click, or Escape; contain focus while open and restore it on close.

## Performance acceptance

The archive DOM is built once during deferred UI startup and performs no work in simulation or rendering loops. Hardware-GPU FPS verification remains pending for Patrick on `dev`; no GPU benchmark was run in this environment.
