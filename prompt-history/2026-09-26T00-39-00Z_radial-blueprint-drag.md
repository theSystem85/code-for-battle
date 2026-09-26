# 2026-09-26T00:39:00Z

Cursor Cloud Agent using Grok 4.7. Token counts and elapsed time were not available.

## Prompt

User tested PR #710 and says it works well. Add this on the SAME branch/PR (cursor/radial-build-menu-880d):

When a BUILDING option is chosen from the radial menu, the user must be able to place it immediately, supporting BOTH flows:

A) Release-then-drag: user releases on a building button, the UI enters planning/placement mode (as now). Then the user presses on the map and DRAGS: the building blueprint (placement ghost with valid/invalid tile coloring) follows the pointer/finger live while dragging. On release, the blueprint is placed at that position and the build starts. This must work on touch (no tap-first needed; press-drag-release places) and mouse. A plain tap on the map should still place at the tapped tile as the existing planning mode does.

B) Hold-on-button: while the radial menu is open and the user is still holding, if the pointer rests on a BUILDING button for 500ms, the menu closes immediately and the UI goes directly into planning mode with the blueprint attached to the pointer; the user keeps holding and drags the blueprint over the map; on release the blueprint is placed and the build starts. Show a small progress indication on the button during the 500ms hover (e.g. ring fill) so it's discoverable. Unit buttons keep the current behavior (release to queue; hovering does not trigger anything). Moving off the button before 500ms resets the timer.

In both flows: 'build starts on release after the blueprint was placed' — use the game's existing planning-mode/blueprint placement semantics so the placed blueprint queues/starts construction at that location exactly like placing via sidebar planning mode (including multiplayer/lockstep command paths). If the release position is invalid, don't place; stay in planning mode (flow A) or cancel cleanly with feedback (flow B, keep planning mode active so the user can retry by dragging again). Releasing over the radial menu area/UI or pressing B/Escape/right-click cancels. The map must not scroll/box-select during these drags; edge scrolling while dragging a blueprint near screen edges is a nice-to-have if the codebase already supports it.

Add unit tests for the hover-500ms-to-drag transition, drag-placement on release, invalid placement, and that unit buttons are unaffected. Update specs/093-radial-build-menu.md. Verify with screenshots (tutorial completed) on desktop and phone: hover progress ring, blueprint being dragged over the map in both flows, and the placed building starting construction. Keep tests/lint green; rebase onto latest origin/main if needed (rebase only, --force-with-lease). Report changes and screenshot paths.
