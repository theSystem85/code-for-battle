# Spec 089: First tank milestone video

## Summary
When the local player produces their first standard land tank, play `public/video/first_tank.mp4` through the existing milestone video overlay. The clip plays once per match. A second tank, a later vehicle, or a reloaded save that already recorded the milestone does not play it again. A restarted match clears milestones the same way as the refinery, Tesla coil, and airstrip clips.

## Asset
- File: `public/video/first_tank.mp4`
- Source: H.264 video with AAC audio, about 6 seconds
- Playback name passed to `playSyncedVideoAudio`: `first_tank`
- There is no separate `.mp3`. The overlay looks for `first_tank.mp3`, fails to load it, and plays the AAC track embedded in the mp4. That is the existing fallback in `src/ui/videoOverlay.js`.

## Trigger
- Milestone id: `firstTank`
- Checked in `MilestoneSystem.checkMilestones`, which the game loop already calls every 60 frames
- Fires when a unit owned by `gameState.humanPlayer` has type `tank_v1` or the production alias `tank`
- `createUnit` stores a produced `tank` as `tank_v1`. Both ids are the same standard land tank
- Does not fire for `tank-v2`, `tank-v3`, `rocketTank`, harvesters, or any other vehicle
- Does not fire for an enemy-owned tank
- `triggerMilestone` records the id, shows the achievement notification, and plays the video on the minimap overlay with the same skip control and volume path as `tank_over_crystals`, `tesla_coil_hits_tank`, and `air_strip`
- Game audio is not muted. Existing milestone clips do not mute the rest of the mix
- `achievedMilestones` is saved and restored with the match. `milestoneSystem.reset()` on restart clears it, so a new match can play the clip again

## How to test
1. Start a match, build a Vehicle Factory, and produce one tank.
2. Confirm the first-tank video plays once on the milestone overlay and the achievement notice appears.
3. Produce more tanks. The video does not play again.
4. Produce a different vehicle first, then a tank. The video waits for the tank.
5. Save after the video has played, reload that save, and confirm it does not replay. Restart the match and confirm a new first tank can play it again.

## Performance
The new check is one owner-and-type scan inside the existing milestone pass, and only until `firstTank` is achieved. It does not run per rendered entity, allocate per frame, or add canvas fills. 75 presented FPS is not certified here: this session is headless and has no 75 Hz display. The qualifying-hardware check remains outstanding.
