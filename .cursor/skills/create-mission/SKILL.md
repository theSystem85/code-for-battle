---
name: create-mission
description: >-
  Use when adding, replacing, or editing a Code for Battle campaign mission,
  builtin save, briefing, mission i18n, or mission intro video. Covers where
  mission files live, the save schema, maps, units, win/lose, and the checks
  that fail if the id, owners, or layout are wrong.
---

# Create a mission

Builtin missions are locked saves. The match loads through the same path as a player save. There is no separate objective engine.

## Files

| Piece | Where |
| --- | --- |
| Registry | `src/missions/index.js` exports `builtinMissions` and `getBuiltinMissionById` |
| Mission module | `src/missions/mission_<id>.js`, one `export const` whose `state` is a JSON string |
| Generators | `scripts/generateMission01.js`, `scripts/generateFullBaseTest.js` |
| Copy | `src/missions/locales/en.json`, `src/missions/locales/de.json` |
| Copy helper | `src/missions/missionText.js` |
| Load and list | `src/saveGame.js` (`getSaveGames`, `loadGame`, prefix `builtin:`) |
| Intro panel | `src/ui/missionIntro.js`, styles in `styles/overlays.css` |
| Intro asset | `public/video/<name>.mp4`, optional `<name>.mp3` |
| Win/lose | `src/game/gameStateManager.js` `checkGameEndConditions` |
| Building stats | `src/data/buildingData.js` |
| Unit stats | `UNIT_PROPERTIES` and `UNIT_GAS_PROPERTIES` in `src/config.js` |

The Save Games list is the mission select UI. Builtin rows show a MISSION badge, the localized label, and the description as the tooltip. They cannot be deleted.

## Mission object

```js
{
  id: 'Mission_01',              // stable. Storage key is builtin:<id>
  labelKey: 'missions.mission01.label',
  descriptionKey: 'missions.mission01.description',
  objectiveKeys: ['missions.mission01.objectives.power'],
  label: 'English fallback',     // used if the key is missing
  description: 'English fallback',
  introVideo: 'mission_01_intro.mp4', // omit to skip the intro
  introAudio: 'mission_01_intro.mp3', // optional
  time: Date.UTC(2025, 0, 1),    // newer time sorts higher among builtin rows
  state: JSON.stringify(saveData)
}
```

Keep `Mission_01` when replacing the first mission. Selectors, the first-row tests, and any stored `builtin:Mission_01` key depend on that id.

Add both locales for every player-facing string. Resolution uses `cfb-landing-locale`, then `navigator.languages`, same as the landing page. German is `de`. Fallback is English.

## Save `state`

Follow `scripts/generateFullBaseTest.js`. Top-level shape:

- `gameState`: money, `startMoney`, `humanPlayer: 'player1'`, `playerCount`, map size, power totals, `availableBuildingTypes`, `availableUnitTypes`, `achievedMilestones`, `mapSeed`, `currentSessionId`
- `buildings`: finished buildings. Do not also put this array inside `gameState`. `Object.assign` would replace the live buildings array.
- `units`, `unitWrecks`, `orePositions`, `mapGridTypes`, `aiFactoryBudgets`, `factoryRallyPoints`, `achievedMilestones`, `productionQueueState`

`mapGridTypes` is a full `height × width` grid of `'land' | 'water' | 'rock' | 'street'`. A missing cell keeps whatever terrain was already in memory.

`orePositions` is `{x, y}` tiles. Load sets `ore` and `oreDensity: 1`. Do not put ore on water, rock, or a building footprint.

Human construction yard:

- `owner` and `id` are both `player1`
- `isHuman: true`, `constructionFinished: true`
- camera centering looks up `factory.id === humanPlayer`

Enemy construction yard id is `player2`. Its money is `aiFactoryBudgets.player2` and `building.budget`, not `gameState.money`.

Unit position is the center tile:

```js
tileX = Math.floor((x + TILE_SIZE / 2) / TILE_SIZE)
```

Place the unit at `x = tileX * TILE_SIZE` so the center stays on that tile. Do not stand a unit on a building tile, water, or rock.

## What the player can build

The sidebar shows `gameState.availableBuildingTypes`. A normal early game includes construction yard, power plant, ore refinery, vehicle factory, workshop, radar, hospital, helipad, gas station, turret v1, street, and concrete wall.

Tech gates in `src/ui/productionControllerTechTree.js`:

- a vehicle factory unlocks the basic tank
- a vehicle factory and an ore refinery together unlock the harvester
- further units need workshop, radar, helipad, shipyard, and so on

Power counts a living construction yard twice: +50 from the factory list and +50 from `building.power` (`updatePowerSupply`). A refinery is −150 and a vehicle factory is −50. One yard alone goes negative if the player builds the refinery before a power plant. Say that in the briefing.

## Win and lose

`checkGameEndConditions` ends the match. Concrete walls do not count.

- Defeat: the human player has no other buildings left.
- Victory: every other player has no other buildings left. Message: `VICTORY - All enemy buildings destroyed!`

Briefing lines do not change those rules. If a mission needs a different goal, that is new simulation code, not a field on the mission object.

## Enemy economy

`ensureAIEconomyRecovery` in `src/ai/enemyAIPlayer.js` sells non-protected buildings until it can afford a refinery, then a harvester. Turrets are first on the sell list. An outpost with no refinery and no harvester will sell its own guns. Give the enemy both, or set the layout up knowing the sell will happen. A small budget and a small ore patch keep a first mission from snowballing.

Enemy tanks will eventually path toward the player base. Distance and a pause during the intro are the grace period.

## Intro video

Set `introVideo` to a filename only. `queueMissionIntro` runs at the end of a successful builtin load and pauses the sim. `presentGameLoad` calls `flushQueuedMissionIntro` after the loading screen hides, so the clip does not play under the loader.

- Frame is 16:9, `object-fit: contain`. Prefer 1280×720 or 1920×1080 H.264.
- Optional companion mp3 uses the same base name. If it fails, the mp4 audio is used. Silent video is valid.
- If the mp4 fails or times out (2.5s), the panel stays on the localized briefing and objectives.
- Skip button and Escape close it and unpause. Do not commit a large placeholder binary.
- Milestone clips (`playSyncedVideoAudio`, 5:3 radar) are a different system. Do not route the intro through `videoOverlay`.

Player saves, direct state loads, and `multiplayerSession.isRemote` do not show the intro. Omit `introVideo` on test saves such as Full Base Test.

## Steps

1. Add or extend a generator. Read `buildingData` and `UNIT_PROPERTIES` instead of copying old health and power numbers.
2. Lay out terrain, then buildings, then units. Reject overlaps, blocked footprints, and a missing land/street route before writing the file.
3. Add EN and DE strings. Point `labelKey`, `descriptionKey`, and `objectiveKeys` at them. Copy the English fallback onto the mission object from `en.json` so the two cannot drift inside the generator.
4. Register the export in `src/missions/index.js`. Generators overwrite that file; keep every mission in the array. `builtinMissions[0]` is Mission 01.
5. Pick `time` so the row sorts where it should. Higher timestamps sort first among builtin rows.
6. Add a unit test that imports the real module and parses `state`. The index test mocks `mission_01.js` and will not see generator output.
7. Run `node scripts/generateMission01.js` (or the new generator), then `npm run test:unit` and `npm run lint:fix:changed`.
8. Update `TODO/Features.md` under **Missions and Campaign** (above Done) and add or adjust a spec under `specs/`. Use `- [ ]`, a short **bold title**, one description, and `Spec: [Title](../specs/....md)` or `Spec: none`.

## Done checklist

- Id is stable if this replaces an existing mission. Any new id is documented.
- Human yard id is `player1`. Enemy budget is on the enemy yard.
- Buildings do not overlap. Units use the center-tile formula and stand on land or street.
- `mapGridTypes` covers the whole map. Ore is not under buildings or water.
- Opening credits can pay for the buildings the briefing tells the player to build.
- EN and DE both contain the label, description, and objectives.
- Intro path is documented. No dummy video binary unless a test truly needs bytes.
- Full Base Test, sandbox, and other missions still load. Only missions with `introVideo` pause for the panel.
- Label assertions in `tests/unit/missions/fullBaseTest.test.js` match the new Mission 01 name.

## Pitfalls

- Hand-editing `mission_01.js` fights the generator. Change the script and regenerate.
- Do not paint a solid street rectangle under a starting base. Organic road art is dark asphalt on top of the grass underlay, so a plaza reads as black missing ground. Put the yard on `land` and keep roads narrow. `mapGridTypes` does not store biome; land still draws as grass. A camera move does not fix a bad tile type.
- Putting `buildings` inside `gameState` in the blob swaps the live array on load.
- Using owner `player` instead of `player1` still works in some alias checks, but the camera looks for id `player1` first. Use `player1`.
- A zero-budget enemy with no refinery sells its turret to buy one. That silently deletes the defense you authored.
- The harvester button stays locked until both the factory and the refinery exist. A briefing that says "build a harvester first" is wrong.
- Index tests mock Mission 01. Assert the generated file in its own test.
- Builtin list order is timestamp order, not array order, once both rows are builtin. Array order still decides registration.
- The intro must be flushed after the loading screen. Starting playback inside `loadGame` plays under the loader and burns the clip.
- Escape is also "cancel / deselect". The intro listener has to run in the capture phase and stop propagation.
- This repo's 75 FPS gate is not satisfied by unit tests or a headless run. Say so in the spec if the change does not touch the hot path, and do not mark a performance pass you did not measure.
