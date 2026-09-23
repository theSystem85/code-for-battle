# Expanded left sidebar layout

## Summary
The expanded left sidebar keeps one accordion pattern, consistent section spacing, and at most two form controls on a row. The master volume slider still updates live while dragging, and its preview sample plays only when the pointer or key is released.

## Requirements
1. Multiplayer and Save/Load Game use the same expand/collapse behavior as Map Settings: header button, chevron (`▼` closed, `▲` open), `aria-expanded`, and `display` toggling. Sections start closed. Open state is not persisted, because Map Settings does not persist it. Opening a section scrolls it into view with the same alignment as Map Settings.
2. The statistics block shows a visible "Statistics" headline.
3. Spacing fixes are limited to `#sidebar.expanded-left-sidebar` so the collapsed rail, portrait HUD, and other panels keep their own layout.
4. `.sidebar-form-row` is a two-column grid. A trailing odd control, including Fade under Biome Regions and Shore Sand, spans the next row instead of sitting in a third column.
5. `#masterVolumeSlider` updates the master volume on `input`, and plays the `confirmed` preview only from `change`, `mouseup`, `touchend`, `pointerup`, or `keyup`. One release plays the sample once. A released value of 0 does not play it.

## Acceptance criteria
- Expanding and collapsing Multiplayer or Save/Load Game changes the chevron, `aria-expanded`, and content visibility the same way Map Settings does.
- "Statistics" is visible above Time, Wins, and Losses without opening Map Settings.
- Biome Regions and Shore Sand share a row. Fade is on the following row.
- Dragging the volume slider does not play a sample. Releasing it plays one sample when the volume is above zero.

## Performance
No simulation-tick, animation-frame, or entity-render path changed. The volume `input` handler now skips sound playback while the pointer is down. This change does not certify presented 75 FPS; a headless session cannot measure that, and no hot-path frame budget was added.
