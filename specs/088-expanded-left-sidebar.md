# Expanded left sidebar layout

## Summary
The expanded left sidebar keeps one accordion pattern, consistent section spacing, and at most two form controls on a row. The master volume slider still updates live while dragging, and its preview sample plays only when the pointer or key is released.

## Requirements
1. Multiplayer and Save/Load Game use the same expand/collapse behavior as Map Settings: header button, chevron (`▼` closed, `▲` open), and `aria-expanded`. Sections start closed. Open state is not persisted, because Map Settings does not persist it. Opening a section scrolls it into view with the same alignment as Map Settings. Height animates for 200ms with `ease-in-out` via `grid-template-rows`; `prefers-reduced-motion: reduce` disables that transition.
2. In the expanded left sidebar the three accordions are adjacent, in this order: Save/Load Game, Multiplayer, Map Settings. Speed and the settings-button row stay above them. Statistics and the version footer stay below.
3. The settings button row, including the performance overlay button, stays on one line (`flex-wrap: nowrap`) inside `#sidebar.expanded-left-sidebar`.
4. The statistics block shows a visible "Statistics" headline.
5. Spacing fixes are limited to `#sidebar.expanded-left-sidebar` so the collapsed rail, portrait HUD, and other panels keep their own layout.
6. `.sidebar-form-row` is a two-column grid. A trailing odd control, including Fade under Biome Regions and Shore Sand, spans the next row instead of sitting in a third column.
7. `#masterVolumeSlider` updates the master volume on `input`, and plays the `confirmed` preview only from `change`, `mouseup`, `touchend`, `pointerup`, or `keyup`. One release plays the sample once. A released value of 0 does not play it.

## Acceptance criteria
- Save/Load Game, Multiplayer, and Map Settings appear in that order with nothing between them.
- The settings, docs, cheat, help, and performance buttons share one row.
- Expanding and collapsing an accordion changes height over about 200ms, unless reduced motion is requested.
- Expanding and collapsing Multiplayer or Save/Load Game changes the chevron and `aria-expanded` the same way Map Settings does.
- "Statistics" is visible above Time, Wins, and Losses without opening Map Settings.
- Biome Regions and Shore Sand share a row. Fade is on the following row.
- Dragging the volume slider does not play a sample. Releasing it plays one sample when the volume is above zero.

## Performance
No simulation-tick, animation-frame, or entity-render path changed. The volume `input` handler now skips sound playback while the pointer is down. This change does not certify presented 75 FPS; a headless session cannot measure that, and no hot-path frame budget was added.
