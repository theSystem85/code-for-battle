# Spec 090: First-build milestone videos, preload, and radar fade

## Summary
The local player gets a radar milestone video with narrator voice-over the first time they produce a Mine Layer, Mine Sweeper, Rocket Tank, or Howitzer. The same playback path covers the existing refinery, tank, Tesla coil, and airstrip clips. Every milestone video fades in and out on the minimap. Production of a still-unachieved video milestone preloads that clip so playback can start as soon as the milestone fires.

## Assets
All new and replaced clips live in `public/video/`. Most picture files are 960×576 (5:3) H.264, about 6 seconds. `tank_over_crystals.mp4` and `tesla_coil_hits_tank.mp4` are 1280×720 (16:9). The minimap is 5:3 on desktop (`minimapHeight = round(minimapWidth * 0.6)`) and follows the sidebar when phone portrait or phone landscape resizes it. `renderVideoOverlay` stretches the picture to the radar's current backing width and height (`object-fit: fill` via a full-destination `drawImage`). It does not letterbox or pillarbox. The hidden `<video>` uses the same `object-fit: fill` rule.

Several masters bake black bars into the file. Those bars are not part of the radar picture. `src/ui/milestoneVideoCrop.js` stores a content rect per clip. `drawImage` uses that source rect and the destination is always the full radar backing store. Clips measured with no bars use the whole frame, so a 16:9 picture still stretches to the 5:3 radar. A clip with no manifest entry is scanned once on the first decoded frame (near-black threshold 12 on three rows and three columns; insets under 4px are kept). The result is cached on the video element. Later frames only write numbers into the renderer's reused `videoSourceRect`.

| Video base | Decoded frame | Content rect (x, y, w, h) |
| --- | --- | --- |
| `first_tank` | 960×576 | 52, 0, 854, 576 |
| `air_strip`, `first_artillery`, `first_mine_layer`, `first_mine_sweeper`, `first_rocket_tank` | 960×576 | 192, 0, 576, 576 |
| `tank_over_crystals`, `tesla_coil_hits_tank` | 1280×720 | full frame |

Playback still follows the milestone table below.

| Milestone id | Trigger | Video base | Narration |
| --- | --- | --- | --- |
| `firstMineLayer` | local `mineLayer` | `first_mine_layer` | "Your first Mine Layer is running off the production line." |
| `firstMineSweeper` | local `mineSweeper` | `first_mine_sweeper` | "Your first Mine Sweeper is running off the production line." |
| `firstRocketTankBuilt` | local `rocketTank` | `first_rocket_tank` | "Your first Rocket Tank is running off the production line." |
| `firstHowitzer` | local `howitzer` | `first_artillery` | "Your first Howitzer is running off the production line." |
| `firstTank` | local `tank` or `tank_v1` | `first_tank` | companion `first_tank.mp3` (5:3 remaster replaces the previous mp4) |
| `firstAirstrip` | local `airstrip` | `air_strip` | companion `air_strip.mp3` (5:3 remaster replaces the previous mp4) |
| `firstRefinery` | local `oreRefinery` | `tank_over_crystals` | existing `tank_over_crystals.mp3` left unchanged |
| `firstTeslaCoil` | local `teslaCoil` | `tesla_coil_hits_tank` | existing `tesla_coil_hits_tank.mp3` left unchanged |

`firstRocketTankBuilt` is separate from `rocketTankUnlocked`. The unlock milestone still only unlocks production when a rocket turret exists and does not play a video.

`playSyncedVideoAudio(base)` loads `video/{base}.mp4` and tries `video/{base}.mp3`. Both play at once. `resolveMilestoneAudioMode` does not mute the video when the MP3 is usable.

Only `first_tank.mp4` and `air_strip.mp4` contain an audio track (stereo AAC, about 6 seconds). The other milestone mp4 files are silent pictures: `first_artillery`, `first_mine_layer`, `first_mine_sweeper`, `first_rocket_tank`, `tank_over_crystals`, and `tesla_coil_hits_tank`. Every clip has a companion MP3. The AAC in `first_tank` and `air_strip` does not match the narrator MP3 (cross-correlation about 0), so playing both is not a doubled voice line.

- The MP3 plays at `0.28 * master * sfx * voice * fade`.
- The video element stays unmuted. While the MP3 is playing its volume is the bed `0.1 * master * sfx * voice * fade`, under the voice. With no MP3, or after the MP3 fails, the video uses the `0.28` narration level.
- Master `0`, or the headless test mute, sets `muted` and volume 0 on the video and volume 0 on the MP3. Nothing in the sound manager ducks or pauses the video element. Level is `HTMLMediaElement.volume`, multiplied by the master slider. The video is not wired through the Web Audio graph.
- Preloaded elements clear `defaultMuted` and the `muted` attribute before `play()`.

The game's only slider is master volume; sfx and voice are fully open (`1`). The 220ms radar fade multiplies both levels, including the fade to 0 at the end. Skip, restart, and a queued handoff set volume to 0 and pause both elements immediately.

Unmuted `play()` is attempted because the match starts after a user gesture. `NotAllowedError` plays the picture muted and retries the video soundtrack on the next pointer or key gesture. The companion MP3 still starts.

## Trigger and persistence
`MilestoneSystem.checkMilestones` scans for a unit or building owned by `gameState.humanPlayer`. The first match records the milestone id, shows the achievement notification, and plays the video once. Enemy owners do not count. A second unit of the same type does not play the clip again.

`achievedMilestones` is already saved and restored with the match (`saveGame.js`). The new ids use that same list. `milestoneSystem.reset()` on restart clears them, so a new match can play the clips again.

## Preload
`startNextUnitProduction` and `startNextBuildingProduction` call `preloadMilestoneForProduction` when a queue item actually begins. Restoring an in-progress queue item does the same. The map is:

- units: `tank` / `tank_v1`, `mineLayer`, `mineSweeper`, `rocketTank`, `howitzer`
- buildings: `oreRefinery`, `teslaCoil`, `airstrip`

Preload runs only when that milestone is not yet achieved. It fetches the mp4 and mp3 into hidden media elements and does not set the overlay's current video, so the radar stays on the map until the milestone fires. If the browser cannot buffer the file, playback still uses the existing load path. A preloaded element that is ready is what the minimap draws, so the clip does not wait on a second fetch.

## Unit-ready sting
The first time a Mine Layer, Mine Sweeper, Rocket Tank, Howitzer, or standard tank finishes production, the production-line narrator plays instead of `unitReady01` / `unitReady02` / `unitReady03`. That claim marks the milestone achieved, so the video starts with the unit and a second unit of the same type plays the ready sting as usual. Harvesters and other units without that narrator still play the sting. Buildings are unchanged.

## Fade
`MILESTONE_VIDEO_FADE_MS` is 220. While a milestone video is playing, the minimap asks `getMilestoneVideoOpacity()`:

- 0 at the start timestamp, rising to 1 over 220ms
- 1 through the middle of the clip
- falling to 0 over the last 220ms

At full opacity the video still replaces the radar, which is the previous behavior. Below 1 the radar is drawn first and the video frame is painted with `globalAlpha`, then alpha is restored. The fade does not add a full-widget translucent fill, gradient, or shadow. The opacity math does not allocate. While a clip is playing, one reused animation frame writes the faded volume onto the companion MP3 or the unmuted video element. That write does not allocate.

## How to test
1. Start a match and begin production of a Mine Layer, Mine Sweeper, Rocket Tank, or Howitzer before you have built one. The radar should stay on the map while the bar runs (preload does not show the video).
2. When that first unit finishes, the matching clip plays on the radar with the narrator line above, fades in within about a quarter second, and fades out at the end. The picture covers the whole radar, stretched if its aspect ratio is not the radar's.
3. Build a second one. The video does not play again.
4. Save after the video, reload, and confirm it does not replay. Restart the match and confirm a new first unit can play it again.
5. Repeat for the first tank and the first airstrip. Both should still play, now with their companion narration, and should fade the same way.
6. Build the first refinery and the first Tesla coil and confirm those existing narrated clips still play and fade.

## Performance
Preload runs once when production starts, not per simulation tick. The new milestone scans run inside the existing every-60-frames pass and stop once each id is achieved. While a clip is fully opaque, the minimap still draws only the video, now as one full-radar `drawImage` instead of a contain fit. The radar is drawn underneath only during the 220ms fade in and fade out. No per-frame objects, sets, or linear entity searches were added to the video draw. The audio fade is one reused frame callback and two volume property writes for the duration of the clip. 75 presented FPS is not certified here: this session is headless and has no 75 Hz display. The qualifying-hardware check remains outstanding.
