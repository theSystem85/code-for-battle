# Spec 091: Mission 01 Fordline and intro video

## Summary

Mission 01 keeps the id `Mission_01` and the storage key `builtin:Mission_01`. The old Midnight Siege fortress is replaced by Fordline, a first-mission layout that teaches power, ore, production, and a small fight. Loading that builtin mission pauses the simulation and opens a skippable intro. If `public/video/mission_01_intro.mp4` is present it plays in a 16:9 frame. If the file is missing, the same panel shows the localized briefing. Full Base Test, sandbox, player saves, and multiplayer sessions do not play it.

## How to play

1. Open the sidebar **Save Games** tab.
2. Choose **Mission 01: Fordline** (German locale: **Mission 01: Furtlinie**). It has the green **MISSION** badge and no delete button.
3. After the loading screen, the intro panel appears. Press **Skip** or **Escape**. The match stays paused until then.
4. The camera centers on the green construction yard in the south.

Locale follows the landing-page key `cfb-landing-locale`, then the browser language. English and German dictionaries live in `src/missions/locales/`.

## Mission design

The player (`player1`) starts in the south with:

- one construction yard, id `player1`
- one `tank_v1` on grass just east of the yard
- 11000 credits, enough for a Power Plant (2000), Ore Refinery (2500), Vehicle Factory (3000), and Harvester (1500), with 2000 left
- a large density-1 ore seam immediately east of the yard
- the normal early sidebar (power, refinery, factory, workshop, radar, hospital, helipad, gas station, turret v1, street, wall)

The enemy (`player2`) holds a walled camp north of a river. It is larger than the first layout and still a first fight: no Tesla coil, artillery, or rocket turret.

- construction yard, power plant, ore refinery, two turret gun v1
- a concrete-wall ring with a five-tile opening on the south side, facing the road
- two light tanks and one harvester
- a small ore patch inside the walls and a 500 credit budget

The player yard and the tiles under it are land. A narrow road runs from beside the yard to a ford through the river (rows 48–53). Rock clusters sit off that road. A solid street rectangle is not used around the start: organic road sprites are dark asphalt drawn over the grass underlay, and a plaza of them reads as black missing ground while the surrounding land stays visible grass.

Win and lose use the existing annihilation rules in `checkGameEndConditions`: destroy every enemy building that is not a concrete wall, or lose if the player has none left. There is no separate objective tracker. The three briefing lines are the teaching text.

Milestones start empty, so the existing first-refinery and first-tank radar clips can still play once the player builds them.

## Intro video

| Item | Value |
| --- | --- |
| Video path | `public/video/mission_01_intro.mp4` (served as `/video/mission_01_intro.mp4`) |
| Optional voice | `public/video/mission_01_intro.mp3` |
| Picture | 16:9, H.264, contained in the stage (not cropped). 1280×720 or 1920×1080. |
| Audio | AAC inside the mp4, or the companion mp3. A silent mp4 is valid. |
| Missing file | The stage stays on the briefing. No dummy binary is checked in. |

Drop the finished clip on that path and reload Mission 01. Milestone radar clips stay 5:3 and are unchanged.

Playback pauses the match, then resumes on skip, Escape, or when the clip ends. A browser that blocks unmuted autoplay retries muted. Remote multiplayer sessions do not open the panel.

## Authoring

`node scripts/generateMission01.js` rewrites `src/missions/mission_01.js` from `scripts/generateMission01.js`. Do not hand-edit the state string. The script refuses overlapping buildings, units on water or rock, a broken land route to the outpost, and a starting balance that cannot afford the opening chain.

## Performance

The intro is a one-shot overlay, not a per-frame simulation or canvas fill. This headless session does not certify 75 presented FPS. The qualifying-hardware check remains outstanding.

## Tests

- `tests/unit/missions/mission01.test.js` loads the generated mission.
- `tests/unit/missionIntro.test.js` covers the missing-file briefing, playback, skip, and the pause until flush.
- `npm run test:unit`
