# Milestone videos todo

Shared work list for generating the remaining milestone videos. Any agent may pick an item.

## Rules (see the `milestone-video` skill for the full recipe)
- One `public/video/<name>.mp4` per milestone with **built-in audio** (AAC). **No separate `.mp3`** (deprecated).
- **HEVC** (libx265, `hvc1`, 24 fps, CRF ~28, faststart) for every new video.
- **5:3, 960×576** to match the radar/minimap (`canvasManager.js`: height = width × 0.6). Generate 16:9 720p with action centered, then center-crop `crop=1200:720,scale=960:576`.
- 15 s, photorealistic desert military style, sidebar icon as reference image.
- **Maximum 2 generations per clip in total** (the first take plus at most one retake). Run the physics check after each take; if the second take is still imperfect, ship the better of the two or report it. Do not generate a third take.
- Generate one at a time, get Patrick's review, then integrate (`videoFilename` in `src/game/milestoneSystem.js`) and tick the box with the commit SHA.
- Add the clip's base name to `EMBEDDED_AUDIO_ONLY_CLIPS` in `src/ui/milestoneAudioMode.js` so the player uses the video's own audio and never requests a `.mp3` (the list is the single source of truth). Add a `FULL_5X3` entry in `src/ui/milestoneVideoCrop.js`.

## Status legend
`[ ]` open · `[~]` in progress / in review (who, date) · `[x]` done (commit)

## Existing milestones without a video
- [x] `firstFactory` → `first_factory.mp4` (approved by Patrick 2026-11-15, integrated in 42433c8; embedded audio, no MP3)
- [x] `radarBuilt` → `radar_station.mp4` (approved by Patrick 2026-11-15, integrated in 2c2a605; embedded audio, no MP3; 4 takes, the last before the 2-generation cap)
- [x] `tenBuildings` → `ten_buildings.mp4` (approved by Patrick 2026-11-16, integrated in ef9cdf2; embedded audio, no MP3; 2 takes, kept take 1; known issue: steam is frozen, so it plays like a slow zoom into a still image)
- [ ] `firstUnit` → `first_unit.mp4` (low priority, overlaps `firstTank`)
- [x] `harvesterUnlocked` → `harvester_unlocked.mp4` (approved by Patrick 2026-11-16, integrated in ef9cdf2; embedded audio, no MP3; 2 takes, kept take 2; known issue: the drum teeth and hubcaps shimmer/morph slightly, and it has 6 wheels instead of the icon's 4)
- [ ] `rocketTankUnlocked` → `rocket_tank_unlocked.mp4` (not recommended)
- [ ] `recoveryTankUnlocked` → `recovery_tank_unlocked.mp4`
- [ ] `tankV3Unlocked` → `heavy_tank_unlocked.mp4`
- [ ] `tankerTruckUnlocked` → `tanker_truck_unlocked.mp4`

## New milestones (need config + trigger in `milestoneSystem.js`)
- [ ] `firstHarvester` → `first_harvester.mp4`
- [ ] `firstRecoveryTank` → `first_recovery_tank.mp4`
- [ ] `firstTankerTruck` → `first_tanker_truck.mp4`
- [ ] `firstAmbulance` → `first_ambulance.mp4`
- [ ] `firstAmmunitionTruck` → `first_ammunition_truck.mp4`
- [ ] `firstLightTank` → `first_light_tank.mp4`
- [ ] `firstTankV2` → `first_tank_v2.mp4`
- [ ] `firstTankV3` → `first_tank_v3.mp4`
- [ ] `firstAircraftCarrier` → `first_aircraft_carrier.mp4`
- [ ] `firstHovercraft` → `first_hovercraft.mp4`
- [ ] `firstVehicleFerry` → `first_vehicle_ferry.mp4`
- [ ] `firstSupplyShip` → `first_supply_ship.mp4`
- [ ] `firstNavalMineLayer` → `first_naval_mine_layer.mp4`
- [ ] `firstPowerPlant` → `first_power_plant.mp4`
- [ ] `firstHospital` → `first_hospital.mp4`
- [ ] `firstGasStation` → `first_gas_station.mp4` (or `firstTankerTruck`, not both)
- [ ] `firstVehicleWorkshop` → `first_vehicle_workshop.mp4` (or `firstRecoveryTank`, not both)
- [ ] `firstAmmunitionFactory` → `first_ammunition_factory.mp4`
- [ ] `firstRocketTurret` → `first_rocket_turret.mp4` (skip if `rocketTankUnlocked` is done)
- [ ] `firstArtilleryTurret` → `first_artillery_turret.mp4`
- [ ] `firstAutomation` → `first_automation.mp4`
- [ ] `firstEnemySquadAssault` → `enemy_squad_assault.mp4`

## Prompts
Draft prompts per item: see the review list from 2026-11-15; the final prompt used is recorded here when an item is ticked.

### firstFactory (generated 2026-11-15)
Using the factory hangar from <IMAGE_0>: a wide golden-hour aerial of a large grey four-bay military vehicle factory in desert dunes, empty concrete apron (0-5 s). The camera cranes down the facade as the bay doors stand open, welding sparks inside; a desert-camo main battle tank noses out of the center bay (5-10 s). Three-quarter rear tracking as the tank clears the bay and a second chassis waits in the next stall, heat haze (10-15 s). Keep all action centered in the frame. Sound: diesel engine rumble, clanking tracks, machinery hum, welding crackle, desert wind; at about 2 s a calm, deep male military command-briefing voice says: "Your first Vehicle Factory is online. Armor can now roll off the line." No music. Photorealistic cinematic military footage, golden-hour light, dramatic smoke and dust, smooth camera motion, no text, no logos, no watermark.

### radarBuilt (generated 2026-11-15, 4 takes, final prompt)
The radar station exactly as in <IMAGE_0>: a white square concrete bunker, a solid white cylindrical tower with a thin railing platform at the top, and one large white spherical radome on top, alone on a dry desert plain with scrub bushes and one narrow curving dirt road. One single continuous shot, no cuts, no crossfades: slow straight dolly-in with gentle upward tilt ending on the radome against the dawn sky; no orbit, no vehicles, no people; subtle sand wisps, blinking red light. Sound: wind, hum, radar ping every two seconds, no music; at ~2 s narration: 'Radar station operational. Advanced technologies are now available.'

### tenBuildings (generated 2026-11-16, 2 takes, kept take 1)
A slow high aerial glide over a desert military base with a dome construction yard and a crane, about ten structures on the sand, subject kept centered. One single continuous shot, no cuts, no crossfades; the buildings keep exactly the same shape, size and position; nothing morphs, appears or vanishes. Sound: desert wind, distant machinery, no music; at about 2 seconds a calm, deep male military command-briefing voice says: "Industrial complex established. Ten structures are now standing." Photorealistic cinematic military footage, golden-hour light, smooth camera motion, no text, no logos, no watermark.

### harvesterUnlocked (generated 2026-11-16, 2 takes, kept take 2)
Slow push-in toward a fully parked sand-colored harvester beside glowing ore crystals at golden hour, subject kept centered, the vehicle does not roll or slide. One single continuous shot, no cuts, no crossfades; the harvester keeps exactly the same shape, size and position; nothing morphs, appears or vanishes; only sand and the crystal glow move. Sound: desert wind, low engine idle, no music; at about 2 seconds a calm, deep male military command-briefing voice says: "Harvester unlocked. Resource collection is now available." Photorealistic cinematic military footage, golden-hour light, smooth camera motion, no text, no logos, no watermark.
