# 2026-09-24T08:08:00Z

Cursor Cloud Agent using Grok 4.7. Token counts and elapsed time were not available to this session.

## Prompt

Add four new first-build milestone videos plus narrator VO, preload on production start, and quick fade in/out for ALL milestone videos in the radar/minimap widget.

## Attached archive
`uploads/milestone-assets.tar.gz` contains:

NEW (5:3 remasters — unit fully visible, letterboxed; do not crop further):
- `first_mine_layer.mp4` + `first_mine_layer.mp3` — VO: "Your first Mine Layer is running off the production line."
- `first_mine_sweeper.mp4` + `first_mine_sweeper.mp3` — VO: "Your first Mine Sweeper is running off the production line."
- `first_rocket_tank.mp4` + `first_rocket_tank.mp3` — VO: "Your first Rocket Tank is running off the production line."
- `first_artillery.mp4` + `first_artillery.mp3` — VO: "Your first Howitzer is running off the production line." (unit type id is `howitzer`)

REPLACE / ADD VO for existing:
- Replace `first_tank.mp4` with archive’s 5:3 remaster; add `first_tank.mp3`
- Replace `air_strip.mp4` with archive’s 5:3 remaster; add `air_strip.mp3`
- Leave `tank_over_crystals.mp3` and `tesla_coil_hits_tank.mp3` as-is (already have narrative VO).

Extract the archive and copy files into the repo’s public video folder (same place existing milestone mp4/mp3 live, typically `public/video/`).

## Repo context
Milestone videos play via `playSyncedVideoAudio(baseFilename)` in `src/game/milestoneSystem.js`, which loads `video/{base}.mp4` + companion `video/{base}.mp3` (see `src/ui/videoOverlay.js`). Video is painted onto the radar/minimap. Minimap aspect is fixed **5:3** (`minimapHeight = round(minimapWidth * 0.6)`).

Existing video milestones:
- `firstRefinery` → `tank_over_crystals` (has .mp3)
- `firstTank` → `first_tank` (tank / tank_v1)
- `firstTeslaCoil` → `tesla_coil_hits_tank` (has .mp3)
- `firstAirstrip` → `air_strip`

## Code requirements
1. **New milestones** in `milestoneSystem.js` (same pattern as `firstTank`): trigger when the local/human player first has that unit type:
   - `firstMineLayer` → `mineLayer` → video `first_mine_layer`
   - `firstMineSweeper` → `mineSweeper` → `first_mine_sweeper`
   - `firstRocketTankBuilt` (avoid clashing with unlock milestones) → `rocketTank` → `first_rocket_tank`
   - `firstHowitzer` → `howitzer` → `first_artillery`
   Persist achieved milestones the same way as existing ones (save/load).

2. **Preload (do not show)**: As soon as production *starts* for a unit/building that would trigger a still-unachieved milestone video, preload that milestone’s mp4 (and mp3) so playback can start immediately when the milestone fires. Find where production queues or construction starts. Preload only if that milestone is not yet achieved. Do not show until the milestone triggers.

3. **Quick fade in and out**: For every milestone video (new and existing), fade opacity quickly in at start and out at end when drawn on the minimap/radar (~150–300ms). Implement in the minimap video draw path and/or video overlay playback state.

4. **Narrator VO**: Ensure every video milestone has a working companion `.mp3` as listed. If mp3 missing, keep existing fallback so playback still works.

5. Open a PR with a clear summary and how to test (build first Mine Layer / Mine Sweeper / Rocket Tank / Howitzer; confirm radar video + Dave VO; confirm preload by starting production before first complete; confirm fade; confirm first tank + airstrip still work).

Investigate the codebase yourself for exact production-start hooks, save/load of milestones, and minimap video rendering. Verify unit type ids against production UI / unit definitions (`mineLayer`, `mineSweeper`, `rocketTank`, `howitzer`).
