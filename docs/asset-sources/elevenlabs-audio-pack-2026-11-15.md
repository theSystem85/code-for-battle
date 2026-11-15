# ElevenLabs audio pack - 2026-11-15

Handoff spec for the wiring agent. Source of truth for the 45 proposals: the review page "code-for-battle: audio gaps & ElevenLabs prompts" (all 45 approved by the project owner). This commit adds **assets and credits only**; no JS was changed. Every file lives in `public/sound/` (flat, same folder as the existing effects and announcer lines).

## Summary

- 78 mp3 files, 2.46 MB total, generated 2026-11-15 on the owner's ElevenLabs account.
- Per category: Unit / weapon SFX 21, Building / economy SFX 9, UI SFX 7, Ambience loop 3, Announcer VO 10, Unit acknowledgement VO 28.
- SFX: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`), prompt text exactly as on the review page, durations / `prompt_influence` / loop flags as listed there (generator minimum is 0.5 s, so `error`, `uiToggleOn`, `uiToggleOff`, `uiTabSwitch` were generated at 0.5 s and trimmed to 0.4 / 0.3 / 0.3 / 0.25 s). Encoded stereo 44.1 kHz 128 kbps MP3. Leading/trailing silence trimmed on one-shots. Limiter ceiling -3 dBFS.
- Announcer VO: voice **Dave** (`RF6N5izArqlUgNy6JsKW`, same voice as the milestone narrations), model `eleven_v4`, default voice settings, mono 44.1 kHz 128 kbps, normalized to -23 LUFS (same level as `ourBaseIsUnderAttack.mp3`, -23.4 LUFS).
- Unit acknowledgement / retreat VO: voice **Admiral Action - Military Man** (`GLSWsaquVBsIPLPPRi2s`, workspace library voice, "war-torn, boots-on-the-ground sergeant"), distinct from Dave; model `eleven_v4`, default voice settings, same voice for every acknowledgement; mono 44.1 kHz 128 kbps, -23 LUFS. Light tags (`[aggressively]`, `[calmly]`, `[firmly]`, `[relaxed]`, `[urgently] [breathless]`) carry the delivery described on the page. The page specified no radio band-pass, so none was applied.
- Verification: every file is non-silent and has a sane duration (see table); all 38 VO clips were transcribed with a local Whisper `small.en` model and match the intended text. Regenerated once after a failed check: `radarOffline` (first take nearly silent) and `ackNavalAttack1` (heard as "duns ready").
- Loops (`smallShipCruise`, `refuelPumpLoop`, `ambience*`) were generated with the loop option on and additionally equal-power / linear cross-faded head-to-tail by the project, so they are 0.2 s (ship, pump) and 0.5 s (ambience) shorter than requested (3.8 s, 2.8 s, 19.5 s). They contain no start/end fades.
- Level matching: existing SFX in `public/sound/` vary from about -4 to -23 LUFS integrated (weapon shots -9 to -13, explosions -8 to -11, UI/VO about -22). New effects use per-class targets listed in the table; impulsive one-shots under 0.8 s are peak-normalized instead (loudness is unreliable on very short clips).

## Wiring notes (from the page)

- Register each key in `src/sound.js` `soundFiles` as `key: ['file1.mp3', 'file2.mp3']`; a random variant is chosen per play. Audio loads on demand.
- One-shot positional effects: `playPositionalSound(key, x, y, vol)`. Loops: pass `{ playLoop: true }` (see `beginLoopedMovementSound` in `movementCore.js`). Announcer lines: `playSound(key, 1, cooldownSec, true)` for the stackable narrator queue (max 3); under-attack style lines keep a 60 s cooldown in `src/game/attackNotifications.js`.
- Free fixes found in the audit that need no new asset: wire existing `public/mine_explosion.mp3` for `detonateMine`; replace the empty `error`/cancel entries; re-enable the commented-out `crewRestored` and refuel calls; stop re-using the spoken `confirmed` line for toggles.
- Key names below are the proposed `soundFiles` keys (taken from the page where it named one, otherwise the file stem without the variant number).

## Files

| id | file | category | sound key | loop / one-shot | voice | duration s | LUFS | peak dBFS | size KB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `achievementStinger` | `public/sound/achievementStinger.mp3` | UI SFX | `achievementStinger` | one-shot | - | 0.97 | -16.89 | -3.0 | 15 |
| `ackAirAttack1` | `public/sound/ackAirAttack1.mp3` | Unit acknowledgement VO | `ackAirAttack` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.84 | -23.42 | -6.1 | 13 |
| `ackAirAttack2` | `public/sound/ackAirAttack2.mp3` | Unit acknowledgement VO | `ackAirAttack` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.2 | -23.46 | -5.3 | 19 |
| `ackAirMove1` | `public/sound/ackAirMove1.mp3` | Unit acknowledgement VO | `ackAirMove` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.73 | -23.47 | -5.8 | 11 |
| `ackAirMove2` | `public/sound/ackAirMove2.mp3` | Unit acknowledgement VO | `ackAirMove` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.23 | -23.49 | -4.3 | 19 |
| `ackAirSelect1` | `public/sound/ackAirSelect1.mp3` | Unit acknowledgement VO | `ackAirSelect` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.65 | -23.45 | -6.9 | 10 |
| `ackAirSelect2` | `public/sound/ackAirSelect2.mp3` | Unit acknowledgement VO | `ackAirSelect` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.15 | -23.44 | -6.7 | 18 |
| `ackAttackGround1` | `public/sound/ackAttackGround1.mp3` | Unit acknowledgement VO | `ackAttackGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.2 | -23.46 | -10.1 | 19 |
| `ackAttackGround2` | `public/sound/ackAttackGround2.mp3` | Unit acknowledgement VO | `ackAttackGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.28 | -23.42 | -8.6 | 20 |
| `ackAttackGround3` | `public/sound/ackAttackGround3.mp3` | Unit acknowledgement VO | `ackAttackGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.57 | -23.4 | -10.8 | 9 |
| `ackMoveGround1` | `public/sound/ackMoveGround1.mp3` | Unit acknowledgement VO | `ackMoveGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.57 | -23.45 | -9.4 | 9 |
| `ackMoveGround2` | `public/sound/ackMoveGround2.mp3` | Unit acknowledgement VO | `ackMoveGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.68 | -23.42 | -8.5 | 11 |
| `ackMoveGround3` | `public/sound/ackMoveGround3.mp3` | Unit acknowledgement VO | `ackMoveGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.76 | -23.48 | -11.7 | 12 |
| `ackNavalAttack1` | `public/sound/ackNavalAttack1.mp3` | Unit acknowledgement VO | `ackNavalAttack` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.76 | -23.46 | -6.8 | 12 |
| `ackNavalAttack2` | `public/sound/ackNavalAttack2.mp3` | Unit acknowledgement VO | `ackNavalAttack` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.5 | n/a (<0.5 s) | -9.0 | 8 |
| `ackNavalMove1` | `public/sound/ackNavalMove1.mp3` | Unit acknowledgement VO | `ackNavalMove` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.99 | -23.4 | -8.9 | 15 |
| `ackNavalMove2` | `public/sound/ackNavalMove2.mp3` | Unit acknowledgement VO | `ackNavalMove` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.91 | -23.44 | -5.9 | 14 |
| `ackNavalSelect1` | `public/sound/ackNavalSelect1.mp3` | Unit acknowledgement VO | `ackNavalSelect` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.23 | -23.44 | -6.4 | 19 |
| `ackNavalSelect2` | `public/sound/ackNavalSelect2.mp3` | Unit acknowledgement VO | `ackNavalSelect` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.55 | -23.42 | -9.5 | 9 |
| `ackSelectGround1` | `public/sound/ackSelectGround1.mp3` | Unit acknowledgement VO | `ackSelectGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.44 | n/a (<0.5 s) | -5.9 | 7 |
| `ackSelectGround2` | `public/sound/ackSelectGround2.mp3` | Unit acknowledgement VO | `ackSelectGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.12 | -23.42 | -9.5 | 18 |
| `ackSelectGround3` | `public/sound/ackSelectGround3.mp3` | Unit acknowledgement VO | `ackSelectGround` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.2 | -23.45 | -8.2 | 19 |
| `ackSupportMove1` | `public/sound/ackSupportMove1.mp3` | Unit acknowledgement VO | `ackSupportMove` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.99 | -23.48 | -8.2 | 15 |
| `ackSupportMove2` | `public/sound/ackSupportMove2.mp3` | Unit acknowledgement VO | `ackSupportMove` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.12 | -23.43 | -9.9 | 18 |
| `ackSupportSelect1` | `public/sound/ackSupportSelect1.mp3` | Unit acknowledgement VO | `ackSupportSelect` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.18 | -23.43 | -8.8 | 18 |
| `ackSupportSelect2` | `public/sound/ackSupportSelect2.mp3` | Unit acknowledgement VO | `ackSupportSelect` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 1.33 | -23.43 | -6.4 | 21 |
| `aircraftLowFuel` | `public/sound/aircraftLowFuel.mp3` | Announcer VO | `aircraftLowFuel` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 3.06 | -23.43 | -8.6 | 48 |
| `ambienceWindDesert` | `public/sound/ambienceWindDesert.mp3` | Ambience loop | `ambienceWindDesert` | LOOP | - | 19.54 | -30.45 | -5.9 | 305 |
| `ambienceWindOpen` | `public/sound/ambienceWindOpen.mp3` | Ambience loop | `ambienceWindOpen` | LOOP | - | 19.54 | -30.41 | -8.8 | 305 |
| `ambienceWindSnow` | `public/sound/ambienceWindSnow.mp3` | Ambience loop | `ambienceWindSnow` | LOOP | - | 19.54 | -30.44 | -12.2 | 305 |
| `ammoReloadClunk` | `public/sound/ammoReloadClunk.mp3` | Building / economy SFX | `ammoReloadClunk` | one-shot | - | 0.99 | -15.6 | -3.0 | 15 |
| `apacheRocketLaunch1` | `public/sound/apacheRocketLaunch1.mp3` | Unit / weapon SFX | `shootApacheRocket` | one-shot | - | 0.81 | -14.03 | -1.3 | 13 |
| `apacheRocketLaunch2` | `public/sound/apacheRocketLaunch2.mp3` | Unit / weapon SFX | `shootApacheRocket` | one-shot | - | 0.63 | -13.89 | -4.7 | 10 |
| `apacheRotorSpoolUp` | `public/sound/apacheRotorSpoolUp.mp3` | Unit / weapon SFX | `apacheRotorSpoolUp` | one-shot | - | 3.03 | -16.43 | -8.5 | 47 |
| `artilleryShellImpact1` | `public/sound/artilleryShellImpact1.mp3` | Unit / weapon SFX | `explosionArtillery` | one-shot | - | 1.38 | -15.53 | -2.7 | 22 |
| `artilleryShellImpact2` | `public/sound/artilleryShellImpact2.mp3` | Unit / weapon SFX | `explosionArtillery` | one-shot | - | 2.51 | -16.66 | -2.6 | 39 |
| `buildingCollapse1` | `public/sound/buildingCollapse1.mp3` | Building / economy SFX | `buildingCollapse` | one-shot | - | 2.32 | -13.74 | -3.0 | 36 |
| `buildingCollapse2` | `public/sound/buildingCollapse2.mp3` | Building / economy SFX | `buildingCollapse` | one-shot | - | 2.22 | -12.9 | -3.0 | 35 |
| `buildingCollapse3` | `public/sound/buildingCollapse3.mp3` | Building / economy SFX | `buildingCollapse` | one-shot | - | 2.43 | -12.97 | -3.1 | 38 |
| `crewRestored` | `public/sound/crewRestored.mp3` | Building / economy SFX | `crewRestored` | one-shot | - | 0.84 | -20.05 | -2.4 | 13 |
| `depthChargeDetonation` | `public/sound/depthChargeDetonation.mp3` | Unit / weapon SFX | `depthChargeDetonation` | one-shot | - | 1.7 | -17.36 | -2.8 | 26 |
| `enemySpotted` | `public/sound/enemySpotted.mp3` | Announcer VO | `enemySpotted` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.46 | -23.42 | -10.1 | 23 |
| `error1` | `public/sound/error1.mp3` | UI SFX | `error` | one-shot | - | 0.37 | n/a (<0.5 s) | -6.4 | 6 |
| `error2` | `public/sound/error2.mp3` | UI SFX | `error` | one-shot | - | 0.44 | n/a (<0.5 s) | -6.3 | 7 |
| `howitzerFire1` | `public/sound/howitzerFire1.mp3` | Unit / weapon SFX | `shootHowitzer` | one-shot | - | 2.51 | -11.46 | -4.9 | 39 |
| `howitzerFire2` | `public/sound/howitzerFire2.mp3` | Unit / weapon SFX | `shootHowitzer` | one-shot | - | 2.17 | -11.45 | -3.6 | 34 |
| `insufficientFunds` | `public/sound/insufficientFunds.mp3` | Announcer VO | `insufficientFunds` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.41 | -23.43 | -9.3 | 22 |
| `lowPower` | `public/sound/lowPower.mp3` | Announcer VO | `lowPower` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 0.89 | -23.46 | -10.3 | 14 |
| `lowPowerAlarm` | `public/sound/lowPowerAlarm.mp3` | Building / economy SFX | `lowPowerAlarm` | one-shot | - | 1.52 | -16.47 | -7.5 | 24 |
| `m2AutocannonBurst1` | `public/sound/m2AutocannonBurst1.mp3` | Unit / weapon SFX | `shootM2` | one-shot | - | 0.5 | n/a (<0.5 s) | -2.7 | 8 |
| `m2AutocannonBurst2` | `public/sound/m2AutocannonBurst2.mp3` | Unit / weapon SFX | `shootM2` | one-shot | - | 0.31 | n/a (<0.5 s) | -3.2 | 5 |
| `m2AutocannonBurst3` | `public/sound/m2AutocannonBurst3.mp3` | Unit / weapon SFX | `shootM2` | one-shot | - | 0.44 | n/a (<0.5 s) | -1.8 | 7 |
| `mineDetonation1` | `public/sound/mineDetonation1.mp3` | Unit / weapon SFX | `mineDetonation` | one-shot | - | 1.52 | -15.05 | -3.1 | 24 |
| `mineDetonation2` | `public/sound/mineDetonation2.mp3` | Unit / weapon SFX | `mineDetonation` | one-shot | - | 0.76 | -15.01 | -3.2 | 12 |
| `mineSweeperDefuse1` | `public/sound/mineSweeperDefuse1.mp3` | Unit / weapon SFX | `mineSweeperDefuse` | one-shot | - | 0.47 | n/a (<0.5 s) | -7.4 | 7 |
| `mineSweeperDefuse2` | `public/sound/mineSweeperDefuse2.mp3` | Unit / weapon SFX | `mineSweeperDefuse` | one-shot | - | 1.04 | -19.65 | -3.3 | 16 |
| `ourAircraftUnderAttack` | `public/sound/ourAircraftUnderAttack.mp3` | Announcer VO | `ourAircraftUnderAttack` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.8 | -23.43 | -8.8 | 28 |
| `ourUnitsUnderAttack` | `public/sound/ourUnitsUnderAttack.mp3` | Announcer VO | `ourUnitsUnderAttack` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.7 | -23.45 | -10.2 | 26 |
| `powerRestored` | `public/sound/powerRestored.mp3` | Announcer VO | `powerRestored` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.2 | -23.43 | -10.3 | 19 |
| `radarOffline` | `public/sound/radarOffline.mp3` | Building / economy SFX | `radarOffline` | one-shot | - | 0.65 | -18.38 | -6.2 | 10 |
| `radarOfflineVO` | `public/sound/radarOfflineVO.mp3` | Announcer VO | `radarOfflineVO` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.44 | -23.43 | -8.5 | 22 |
| `radarOnline` | `public/sound/radarOnline.mp3` | Building / economy SFX | `radarOnline` | one-shot | - | 2.04 | -18.43 | -11.6 | 32 |
| `radarOnlineVO` | `public/sound/radarOnlineVO.mp3` | Announcer VO | `radarOnlineVO` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.2 | -23.45 | -11.3 | 19 |
| `recoveryWinchHook` | `public/sound/recoveryWinchHook.mp3` | Unit / weapon SFX | `recoveryWinchHook` | one-shot | - | 1.75 | -16.8 | -3.0 | 27 |
| `refuelPumpLoop` | `public/sound/refuelPumpLoop.mp3` | Building / economy SFX | `refuelPumpLoop` | LOOP | - | 2.85 | -20.36 | -11.5 | 44 |
| `retreatCall1` | `public/sound/retreatCall1.mp3` | Unit acknowledgement VO | `retreatCall` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.84 | -23.43 | -9.9 | 13 |
| `retreatCall2` | `public/sound/retreatCall2.mp3` | Unit acknowledgement VO | `retreatCall` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.73 | -23.4 | -10.6 | 11 |
| `retreatCall3` | `public/sound/retreatCall3.mp3` | Unit acknowledgement VO | `retreatCall` | one-shot | Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`) | 0.76 | -23.44 | -11.5 | 12 |
| `rocketTankLaunch1` | `public/sound/rocketTankLaunch1.mp3` | Unit / weapon SFX | `shootRocketTank` | one-shot | - | 0.99 | -14.09 | -1.3 | 15 |
| `rocketTankLaunch2` | `public/sound/rocketTankLaunch2.mp3` | Unit / weapon SFX | `shootRocketTank` | one-shot | - | 1.46 | -12.29 | -4.3 | 23 |
| `smallShipCruise` | `public/sound/smallShipCruise.mp3` | Unit / weapon SFX | `smallShipCruise` | LOOP | - | 3.84 | -18.44 | -6.5 | 60 |
| `uiPartyJoin` | `public/sound/uiPartyJoin.mp3` | UI SFX | `uiPartyJoin` | one-shot | - | 0.84 | -18.5 | -5.6 | 13 |
| `uiTabSwitch` | `public/sound/uiTabSwitch.mp3` | UI SFX | `uiTabSwitch` | one-shot | - | 0.29 | n/a (<0.5 s) | -10.4 | 4 |
| `uiToggleOff` | `public/sound/uiToggleOff.mp3` | UI SFX | `uiToggleOff` | one-shot | - | 0.34 | n/a (<0.5 s) | -9.5 | 5 |
| `uiToggleOn` | `public/sound/uiToggleOn.mp3` | UI SFX | `uiToggleOn` | one-shot | - | 0.34 | n/a (<0.5 s) | -9.4 | 5 |
| `unitsBlocked` | `public/sound/unitsBlocked.mp3` | Announcer VO | `unitsBlocked` | one-shot | Dave (`RF6N5izArqlUgNy6JsKW`) | 1.28 | -23.44 | -9.3 | 20 |
| `waterMineBlast1` | `public/sound/waterMineBlast1.mp3` | Unit / weapon SFX | `waterMineBlast` | one-shot | - | 2.51 | -14.3 | -3.2 | 39 |
| `waterMineBlast2` | `public/sound/waterMineBlast2.mp3` | Unit / weapon SFX | `waterMineBlast` | one-shot | - | 1.96 | -15.6 | -3.4 | 31 |

## Trigger and prompt / text per file

### `achievementStinger`

- Page id: `achievementStinger`; category: UI SFX; key to register: `achievementStinger`; one-shot.
- Intended trigger / code location: milestone notification: src/game/milestoneSystem.js ~L522 showNotification(displayName, 'achievement'); silent unless the milestone has a narrated video.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.5 s | prompt_influence 0.55 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Short achievement notification sting, confident rising two-note brass-synth hit with a crisp snare tap, no melody.
- Note: A tiny stinger, not music: check it does not collide with music ducking.

### `ackAirAttack1`

- Page id: `ackAir (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackAirAttack`; one-shot.
- Intended trigger / code location: apache, f22Raptor, f35 currently share the ground acknowledgements (same call sites as above).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[calmly] Weapons hot."

### `ackAirAttack2`

- Page id: `ackAir (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackAirAttack`; one-shot.
- Intended trigger / code location: apache, f22Raptor, f35 currently share the ground acknowledgements (same call sites as above).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[calmly] Engaging target."

### `ackAirMove1`

- Page id: `ackAir (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackAirMove`; one-shot.
- Intended trigger / code location: apache, f22Raptor, f35 currently share the ground acknowledgements (same call sites as above).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[calmly] Vectoring."

### `ackAirMove2`

- Page id: `ackAir (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackAirMove`; one-shot.
- Intended trigger / code location: apache, f22Raptor, f35 currently share the ground acknowledgements (same call sites as above).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[calmly] Copy, en route."

### `ackAirSelect1`

- Page id: `ackAir (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackAirSelect`; one-shot.
- Intended trigger / code location: apache, f22Raptor, f35 currently share the ground acknowledgements (same call sites as above).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[calmly] Flight ready."

### `ackAirSelect2`

- Page id: `ackAir (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackAirSelect`; one-shot.
- Intended trigger / code location: apache, f22Raptor, f35 currently share the ground acknowledgements (same call sites as above).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[calmly] Standing by."

### `ackAttackGround1`

- Page id: `ackAttackGround1-3`; category: Unit acknowledgement VO; key to register: `ackAttackGround`; one-shot.
- Intended trigger / code location: attack order: src/input/unitCommands/attackCommands.js ~L148 always plays 'attacking' (one clip).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[aggressively] Engaging!"

### `ackAttackGround2`

- Page id: `ackAttackGround1-3`; category: Unit acknowledgement VO; key to register: `ackAttackGround`; one-shot.
- Intended trigger / code location: attack order: src/input/unitCommands/attackCommands.js ~L148 always plays 'attacking' (one clip).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[aggressively] Target locked."

### `ackAttackGround3`

- Page id: `ackAttackGround1-3`; category: Unit acknowledgement VO; key to register: `ackAttackGround`; one-shot.
- Intended trigger / code location: attack order: src/input/unitCommands/attackCommands.js ~L148 always plays 'attacking' (one clip).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[aggressively] Firing!"

### `ackMoveGround1`

- Page id: `ackMoveGround1-3`; category: Unit acknowledgement VO; key to register: `ackMoveGround`; one-shot.
- Intended trigger / code location: Move orders play the 'movement' alias (tankEngineStart01 / confirmed / onMyWay) for every unit type: supportCommands.js (14 sites), mouseSelection.js ~L751-774.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "Moving out."
- Note: onMyWay.mp3 already exists; reuse if its voice fits.

### `ackMoveGround2`

- Page id: `ackMoveGround1-3`; category: Unit acknowledgement VO; key to register: `ackMoveGround`; one-shot.
- Intended trigger / code location: Move orders play the 'movement' alias (tankEngineStart01 / confirmed / onMyWay) for every unit type: supportCommands.js (14 sites), mouseSelection.js ~L751-774.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "Roger that."
- Note: onMyWay.mp3 already exists; reuse if its voice fits.

### `ackMoveGround3`

- Page id: `ackMoveGround1-3`; category: Unit acknowledgement VO; key to register: `ackMoveGround`; one-shot.
- Intended trigger / code location: Move orders play the 'movement' alias (tankEngineStart01 / confirmed / onMyWay) for every unit type: supportCommands.js (14 sites), mouseSelection.js ~L751-774.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "On the way."
- Note: onMyWay.mp3 already exists; reuse if its voice fits.

### `ackNavalAttack1`

- Page id: `ackNaval (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackNavalAttack`; one-shot.
- Intended trigger / code location: destroyer, battleship, submarine, hovercraft, carrier etc. share the ground acknowledgements today.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[firmly] Guns ready!"

### `ackNavalAttack2`

- Page id: `ackNaval (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackNavalAttack`; one-shot.
- Intended trigger / code location: destroyer, battleship, submarine, hovercraft, carrier etc. share the ground acknowledgements today.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[firmly] Fire!"

### `ackNavalMove1`

- Page id: `ackNaval (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackNavalMove`; one-shot.
- Intended trigger / code location: destroyer, battleship, submarine, hovercraft, carrier etc. share the ground acknowledgements today.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[firmly] Setting course."

### `ackNavalMove2`

- Page id: `ackNaval (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackNavalMove`; one-shot.
- Intended trigger / code location: destroyer, battleship, submarine, hovercraft, carrier etc. share the ground acknowledgements today.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[firmly] Aye, captain."

### `ackNavalSelect1`

- Page id: `ackNaval (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackNavalSelect`; one-shot.
- Intended trigger / code location: destroyer, battleship, submarine, hovercraft, carrier etc. share the ground acknowledgements today.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[firmly] All stations ready."

### `ackNavalSelect2`

- Page id: `ackNaval (select, move, attack)`; category: Unit acknowledgement VO; key to register: `ackNavalSelect`; one-shot.
- Intended trigger / code location: destroyer, battleship, submarine, hovercraft, carrier etc. share the ground acknowledgements today.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[firmly] Aye aye."

### `ackSelectGround1`

- Page id: `ackSelectGround1-3`; category: Unit acknowledgement VO; key to register: `ackSelectGround`; one-shot.
- Intended trigger / code location: Today every selection plays yesSir01 (sound.js unitSelection; selectionManager.js ~L127-335, keyboardHandler.js ~L589-1001). Per-class pool for tank_v1, lightTank, rocketTank, howitzer.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "Ready."

### `ackSelectGround2`

- Page id: `ackSelectGround1-3`; category: Unit acknowledgement VO; key to register: `ackSelectGround`; one-shot.
- Intended trigger / code location: Today every selection plays yesSir01 (sound.js unitSelection; selectionManager.js ~L127-335, keyboardHandler.js ~L589-1001). Per-class pool for tank_v1, lightTank, rocketTank, howitzer.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "Awaiting orders."

### `ackSelectGround3`

- Page id: `ackSelectGround1-3`; category: Unit acknowledgement VO; key to register: `ackSelectGround`; one-shot.
- Intended trigger / code location: Today every selection plays yesSir01 (sound.js unitSelection; selectionManager.js ~L127-335, keyboardHandler.js ~L589-1001). Per-class pool for tank_v1, lightTank, rocketTank, howitzer.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "Standing by."

### `ackSupportMove1`

- Page id: `ackSupport (select, move)`; category: Unit acknowledgement VO; key to register: `ackSupportMove`; one-shot.
- Intended trigger / code location: ambulance, tankerTruck, ammunitionTruck, recoveryTank, mineLayer, mineSweeper, harvester share the ground acknowledgements.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[relaxed] Copy that."

### `ackSupportMove2`

- Page id: `ackSupport (select, move)`; category: Unit acknowledgement VO; key to register: `ackSupportMove`; one-shot.
- Intended trigger / code location: ambulance, tankerTruck, ammunitionTruck, recoveryTank, mineLayer, mineSweeper, harvester share the ground acknowledgements.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[relaxed] Heading over."

### `ackSupportSelect1`

- Page id: `ackSupport (select, move)`; category: Unit acknowledgement VO; key to register: `ackSupportSelect`; one-shot.
- Intended trigger / code location: ambulance, tankerTruck, ammunitionTruck, recoveryTank, mineLayer, mineSweeper, harvester share the ground acknowledgements.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[relaxed] Ready to assist."

### `ackSupportSelect2`

- Page id: `ackSupport (select, move)`; category: Unit acknowledgement VO; key to register: `ackSupportSelect`; one-shot.
- Intended trigger / code location: ambulance, tankerTruck, ammunitionTruck, recoveryTank, mineLayer, mineSweeper, harvester share the ground acknowledgements.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[relaxed] Support standing by."

### `aircraftLowFuel`

- Page id: `aircraftLowFuel`; category: Announcer VO; key to register: `aircraftLowFuel`; one-shot.
- Intended trigger / code location: jet return-to-base trigger: src/game/jetFuel.js (JET_FALLBACK_RTB_FUEL_RATIO 0.2, ~L12/L163) and the insufficient-fuel notice ~L151.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Aircraft low on fuel. Returning to base."

### `ambienceWindDesert`

- Page id: `ambienceWindDesert (loop)`; category: Ambience loop; key to register: `ambienceWindDesert`; LOOP.
- Intended trigger / code location: Same manager, sand biome.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 20 s | prompt_influence 0.45 | LOOP | 1 take
- Prompt: Battlefield ambience bed, dry desert wind with fine sand hiss and faint distant rumble, no birds, no voices, no music, seamless loop, constant level.

### `ambienceWindOpen`

- Page id: `ambienceWindOpen (loop)`; category: Ambience loop; key to register: `ambienceWindOpen`; LOOP.
- Intended trigger / code location: No ambience system exists. Needs a small manager choosing a bed from the map biome (src/game/mapBiomes.js: grass, soil, sand, snow, mixed). This one: grass/soil.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 20 s | prompt_influence 0.45 | LOOP | 1 take
- Prompt: Battlefield ambience bed, quiet steady wind over open grassland with very faint distant rumble, no birds, no voices, no music, seamless loop, constant level.

### `ambienceWindSnow`

- Page id: `ambienceWindSnow (loop)`; category: Ambience loop; key to register: `ambienceWindSnow`; LOOP.
- Intended trigger / code location: Same manager, snow biome.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 20 s | prompt_influence 0.45 | LOOP | 1 take
- Prompt: Battlefield ambience bed, cold howling arctic wind with soft snow gusts and faint distant rumble, no birds, no voices, no music, seamless loop, constant level.

### `ammoReloadClunk`

- Page id: `ammoReloadClunk`; category: Building / economy SFX; key to register: `ammoReloadClunk`; one-shot.
- Intended trigger / code location: ammo resupply start/finish: src/game/ammunitionSystem.js and src/game/ammunitionTruckLogic.js (no audio).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.5 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Heavy ammunition crate sliding into place and a tank gun breech clunking shut, two metallic clanks.

### `apacheRocketLaunch1`

- Page id: `apacheRocketLaunch`; category: Unit / weapon SFX; key to register: `shootApacheRocket`; one-shot.
- Intended trigger / code location: apache volley: firingHandlers.js handleApacheVolley ~L334, currently 'shoot_rocket'. New key shootApacheRocket.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.2 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Attack helicopter launching a pair of small air-to-ground rockets, two quick sharp hissing whooshes, light and fast.

### `apacheRocketLaunch2`

- Page id: `apacheRocketLaunch`; category: Unit / weapon SFX; key to register: `shootApacheRocket`; one-shot.
- Intended trigger / code location: apache volley: firingHandlers.js handleApacheVolley ~L334, currently 'shoot_rocket'. New key shootApacheRocket.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.2 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Attack helicopter launching a pair of small air-to-ground rockets, two quick sharp hissing whooshes, light and fast.

### `apacheRotorSpoolUp`

- Page id: `apacheRotorSpoolUp`; category: Unit / weapon SFX; key to register: `apacheRotorSpoolUp`; one-shot.
- Intended trigger / code location: apache flightState 'takeoff' / grounded on helipad: src/game/movementApache.js ~L156-247. Only the apache_fly loop exists today.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 3.0 s | prompt_influence 0.55 | one-shot | 1 take (spool-down optional)
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Attack helicopter turbine starting up and the main rotor slowly accelerating to full speed, whine rising into a chopping thump.
- Note: Optional pair: apacheRotorSpoolDown (3.0 s, reverse behaviour) for helipad landing.

### `artilleryShellImpact1`

- Page id: `artilleryShellImpact1-2`; category: Unit / weapon SFX; key to register: `explosionArtillery`; one-shot.
- Intended trigger / code location: howitzer shell landing (projectileType 'artillery'): explosion branches in src/game/bulletSystem.js (~L590-644) use the generic 'explosion' set. New key explosionArtillery.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Large artillery shell impact on dry ground, deep boom followed by dirt and debris raining down, no whistle.

### `artilleryShellImpact2`

- Page id: `artilleryShellImpact1-2`; category: Unit / weapon SFX; key to register: `explosionArtillery`; one-shot.
- Intended trigger / code location: howitzer shell landing (projectileType 'artillery'): explosion branches in src/game/bulletSystem.js (~L590-644) use the generic 'explosion' set. New key explosionArtillery.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Large artillery shell impact on dry ground, deep boom followed by dirt and debris raining down, no whistle.

### `buildingCollapse1`

- Page id: `buildingCollapse1-3`; category: Building / economy SFX; key to register: `buildingCollapse`; one-shot.
- Intended trigger / code location: building destroyed: src/game/buildingSystem.js ~L129 / ~L214 use generic 'explosion'. New key buildingCollapse (random of 3).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 3.5 s | prompt_influence 0.6 | one-shot | 3 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Large concrete and steel building collapsing after a blast, deep boom, crumbling masonry, steel groan, dust settling.

### `buildingCollapse2`

- Page id: `buildingCollapse1-3`; category: Building / economy SFX; key to register: `buildingCollapse`; one-shot.
- Intended trigger / code location: building destroyed: src/game/buildingSystem.js ~L129 / ~L214 use generic 'explosion'. New key buildingCollapse (random of 3).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 3.5 s | prompt_influence 0.6 | one-shot | 3 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Large concrete and steel building collapsing after a blast, deep boom, crumbling masonry, steel groan, dust settling.

### `buildingCollapse3`

- Page id: `buildingCollapse1-3`; category: Building / economy SFX; key to register: `buildingCollapse`; one-shot.
- Intended trigger / code location: building destroyed: src/game/buildingSystem.js ~L129 / ~L214 use generic 'explosion'. New key buildingCollapse (random of 3).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 3.5 s | prompt_influence 0.6 | one-shot | 3 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Large concrete and steel building collapsing after a blast, deep boom, crumbling masonry, steel groan, dust settling.

### `crewRestored`

- Page id: `crewRestored`; category: Building / economy SFX; key to register: `crewRestored`; one-shot.
- Intended trigger / code location: ambulance heal tick: src/game/ambulanceSystem.js ~L230 has playSound('crewRestored') commented out and the key is not registered; same cue fits hospitalLogic.js.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.8 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Short positive medical device chime with a soft gear-clip click, quick two-tone electronic blip, not a melody.

### `depthChargeDetonation`

- Page id: `depthChargeDetonation`; category: Unit / weapon SFX; key to register: `depthChargeDetonation`; one-shot.
- Intended trigger / code location: depth-charge detonations in src/game/navalFleetSystem.js (see spec 088 wiring notes); no sound today.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Depth charge detonating underwater, deep rolling thump with a churning water plume breaking the surface.

### `enemySpotted`

- Page id: `enemySpotted`; category: Announcer VO; key to register: `enemySpotted`; one-shot.
- Intended trigger / code location: fog-of-war reveal (src/game/shadowOfWar.js): needs a new hook with a long cooldown, so audio plus a small code change.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Enemy forces spotted."

### `error1`

- Page id: `error`; category: UI SFX; key to register: `error`; one-shot.
- Intended trigger / code location: sound.js soundFiles.error is [] so playSound('error') falls back to a synthetic beep at 7 call sites: cheatSystem.js:1534, ui/eventHandlers.js:770, ui/runtimeConfigDialog.js:560, buildingRepairHandler.js:183, buildingSellHandler.js:77/102/116. Ship error.mp3 and register it.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.4 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Short low dull denied buzz from a military computer terminal, flat double pulse, dry and not harsh.

### `error2`

- Page id: `error`; category: UI SFX; key to register: `error`; one-shot.
- Intended trigger / code location: sound.js soundFiles.error is [] so playSound('error') falls back to a synthetic beep at 7 call sites: cheatSystem.js:1534, ui/eventHandlers.js:770, ui/runtimeConfigDialog.js:560, buildingRepairHandler.js:183, buildingSellHandler.js:77/102/116. Ship error.mp3 and register it.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.4 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Short low dull denied buzz from a military computer terminal, flat double pulse, dry and not harsh.

### `howitzerFire1`

- Page id: `howitzerFire1-2`; category: Unit / weapon SFX; key to register: `shootHowitzer`; one-shot.
- Intended trigger / code location: howitzer fire: firingHandlers.js ~L654 plays 'shoot_heavy' = tankShot03 (shared with tank_v3 and gun turrets). New key shootHowitzer; also usable for artilleryTurret (buildingSystem.js ~L744).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. 152 mm self-propelled howitzer firing, huge concussive boom with heavy barrel recoil thump and a short ringing decay.

### `howitzerFire2`

- Page id: `howitzerFire1-2`; category: Unit / weapon SFX; key to register: `shootHowitzer`; one-shot.
- Intended trigger / code location: howitzer fire: firingHandlers.js ~L654 plays 'shoot_heavy' = tankShot03 (shared with tank_v3 and gun turrets). New key shootHowitzer; also usable for artilleryTurret (buildingSystem.js ~L744).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. 152 mm self-propelled howitzer firing, huge concussive boom with heavy barrel recoil thump and a short ringing decay.

### `insufficientFunds`

- Page id: `insufficientFunds`; category: Announcer VO; key to register: `insufficientFunds`; one-shot.
- Intended trigger / code location: production paused for money: src/productionQueue.js ~L674 (units) and ~L717 (buildings) show text only; repair pause in buildings.js ~L795 plays only repairPaused.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Insufficient funds."

### `lowPower`

- Page id: `lowPower`; category: Announcer VO; key to register: `lowPower`; one-shot.
- Intended trigger / code location: lowEnergyMode false->true: src/buildings.js ~L600; throttle ~30 s, stackable narrator queue (playSound(name,1,30,true)).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Low power."

### `lowPowerAlarm`

- Page id: `lowPowerAlarm`; category: Building / economy SFX; key to register: `lowPowerAlarm`; one-shot.
- Intended trigger / code location: lowEnergyMode false->true: src/buildings.js ~L600. No audio at all today. Use either this SFX or the lowPower VO (e) or both with a short delay.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.5 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Industrial power-down: a descending electrical whine followed by a two-note warning beep, not musical.

### `m2AutocannonBurst1`

- Page id: `m2AutocannonBurst1-3`; category: Unit / weapon SFX; key to register: `shootM2`; one-shot.
- Intended trigger / code location: lightTank fire: src/game/unitCombat/firingHandlers.js ~L253-255 (soundName 'shoot' at 0.3 vol, re-uses tankShot). New key shootM2, pick among 3 variants.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.0 s | prompt_influence 0.6 | one-shot | generate 3 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. 25 mm autocannon burst from an armored fighting vehicle, five rapid sharp shots, dry metallic crack with tiny brass-casing clinks, close perspective.

### `m2AutocannonBurst2`

- Page id: `m2AutocannonBurst1-3`; category: Unit / weapon SFX; key to register: `shootM2`; one-shot.
- Intended trigger / code location: lightTank fire: src/game/unitCombat/firingHandlers.js ~L253-255 (soundName 'shoot' at 0.3 vol, re-uses tankShot). New key shootM2, pick among 3 variants.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.0 s | prompt_influence 0.6 | one-shot | generate 3 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. 25 mm autocannon burst from an armored fighting vehicle, five rapid sharp shots, dry metallic crack with tiny brass-casing clinks, close perspective.

### `m2AutocannonBurst3`

- Page id: `m2AutocannonBurst1-3`; category: Unit / weapon SFX; key to register: `shootM2`; one-shot.
- Intended trigger / code location: lightTank fire: src/game/unitCombat/firingHandlers.js ~L253-255 (soundName 'shoot' at 0.3 vol, re-uses tankShot). New key shootM2, pick among 3 variants.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.0 s | prompt_influence 0.6 | one-shot | generate 3 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. 25 mm autocannon burst from an armored fighting vehicle, five rapid sharp shots, dry metallic crack with tiny brass-casing clinks, close perspective.

### `mineDetonation1`

- Page id: `mineDetonation1-2`; category: Unit / weapon SFX; key to register: `mineDetonation`; one-shot.
- Intended trigger / code location: detonateMine: src/game/mineSystem.js ~L114 is silent (only a visual explosion). Quick win: wire the existing but unused public/mine_explosion.mp3 (1.5 s); generate only if you want variants.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.5 s | prompt_influence 0.65 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Land mine exploding under a vehicle, tight sharp blast with a burst of dirt and shrapnel debris, short fast decay.
- Note: Optional: skip generation and wire mine_explosion.mp3 first.

### `mineDetonation2`

- Page id: `mineDetonation1-2`; category: Unit / weapon SFX; key to register: `mineDetonation`; one-shot.
- Intended trigger / code location: detonateMine: src/game/mineSystem.js ~L114 is silent (only a visual explosion). Quick win: wire the existing but unused public/mine_explosion.mp3 (1.5 s); generate only if you want variants.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.5 s | prompt_influence 0.65 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Land mine exploding under a vehicle, tight sharp blast with a burst of dirt and shrapnel debris, short fast decay.
- Note: Optional: skip generation and wire mine_explosion.mp3 first.

### `mineSweeperDefuse1`

- Page id: `mineSweeperDefuse`; category: Unit / weapon SFX; key to register: `mineSweeperDefuse`; one-shot.
- Intended trigger / code location: safeSweeperDetonation: mineSystem.js ~L289 (silent). Companion to the existing AllMinesOnTheFieldAreDisarmed VO.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.0 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Controlled small demolition pop of a defused land mine with a metallic clank and a muffled puff of dirt, much quieter than a real explosion.

### `mineSweeperDefuse2`

- Page id: `mineSweeperDefuse`; category: Unit / weapon SFX; key to register: `mineSweeperDefuse`; one-shot.
- Intended trigger / code location: safeSweeperDetonation: mineSystem.js ~L289 (silent). Companion to the existing AllMinesOnTheFieldAreDisarmed VO.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.0 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Controlled small demolition pop of a defused land mine with a metallic clank and a muffled puff of dirt, much quieter than a real explosion.

### `ourAircraftUnderAttack`

- Page id: `ourAircraftUnderAttack`; category: Announcer VO; key to register: `ourAircraftUnderAttack`; one-shot.
- Intended trigger / code location: attackNotifications.js for apache / f22Raptor / f35 targets (no air line exists).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Our aircraft are under attack."

### `ourUnitsUnderAttack`

- Page id: `ourUnitsUnderAttack`; category: Announcer VO; key to register: `ourUnitsUnderAttack`; one-shot.
- Intended trigger / code location: src/game/attackNotifications.js: VO only for base (~L238), harvesters (~L246) and naval (~L220); ground units only get the 8 s text notice. Add a 60 s cooldown line like the others.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Our units are under attack."

### `powerRestored`

- Page id: `powerRestored`; category: Announcer VO; key to register: `powerRestored`; one-shot.
- Intended trigger / code location: lowEnergyMode true->false: src/buildings.js ~L608.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Power restored."

### `radarOffline`

- Page id: `radarOffline`; category: Building / economy SFX; key to register: `radarOffline`; one-shot.
- Intended trigger / code location: radarActive true->false: src/buildings.js ~L604 (power negative or station lost).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.5 s | prompt_influence 0.55 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Radar powering down, falling electronic whine collapsing into a burst of static crackle.

### `radarOfflineVO`

- Page id: `radarOfflineVO`; category: Announcer VO; key to register: `radarOfflineVO`; one-shot.
- Intended trigger / code location: radarActive true->false: src/buildings.js ~L604.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Radar offline."

### `radarOnline`

- Page id: `radarOnline`; category: Building / economy SFX; key to register: `radarOnline`; one-shot.
- Intended trigger / code location: radarActive false->true: src/buildings.js ~L604-611 (minimap just stops showing static).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.0 s | prompt_influence 0.55 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Radar scope powering up, rising electronic hum then a soft sonar-like ping sweep.

### `radarOnlineVO`

- Page id: `radarOnlineVO`; category: Announcer VO; key to register: `radarOnlineVO`; one-shot.
- Intended trigger / code location: radarActive false->true: src/buildings.js ~L611 (use with or instead of the radarOnline SFX).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Radar online."

### `recoveryWinchHook`

- Page id: `recoveryWinchHook`; category: Unit / weapon SFX; key to register: `recoveryWinchHook`; one-shot.
- Intended trigger / code location: recoveryTank tow: src/game/recoveryTankSystem.js ~L115-134 (state 'towingToWorkshop'); only repair VO plays.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.0 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Heavy steel winch cable ratcheting tight and a hook clanking onto a vehicle, chain tension creak.

### `refuelPumpLoop`

- Page id: `refuelPumpLoop (loop)`; category: Building / economy SFX; key to register: `refuelPumpLoop`; LOOP.
- Intended trigger / code location: refuel while parked in service area: src/game/gasStationLogic.js ~L33 (unitRefules call commented out) and src/game/tankerTruckLogic.js refuel state.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 3.0 s | prompt_influence 0.5 | LOOP | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Seamless loop, constant level, no start or end transient. Industrial diesel fuel pump running, steady liquid flowing through a hose over a mechanical motor hum.

### `retreatCall1`

- Page id: `retreatCall1-3`; category: Unit acknowledgement VO; key to register: `retreatCall`; one-shot.
- Intended trigger / code location: retreat: src/behaviours/retreat.js ~L99 plays 'confirmed' at 0.7 vol.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[urgently] [breathless] Falling back!"

### `retreatCall2`

- Page id: `retreatCall1-3`; category: Unit acknowledgement VO; key to register: `retreatCall`; one-shot.
- Intended trigger / code location: retreat: src/behaviours/retreat.js ~L99 plays 'confirmed' at 0.7 vol.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[urgently] [breathless] Pulling out!"

### `retreatCall3`

- Page id: `retreatCall1-3`; category: Unit acknowledgement VO; key to register: `retreatCall`; one-shot.
- Intended trigger / code location: retreat: src/behaviours/retreat.js ~L99 plays 'confirmed' at 0.7 vol.
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Admiral Action - Military Man (`GLSWsaquVBsIPLPPRi2s`)
- Spoken text: "[urgently] [breathless] Retreating!"

### `rocketTankLaunch1`

- Page id: `rocketTankLaunch`; category: Unit / weapon SFX; key to register: `shootRocketTank`; one-shot.
- Intended trigger / code location: rocketTank burst: firingHandlers.js handleRocketBurstFire ~L279 / soundName 'shoot_rocket' (~L253) = patriotMissile01/02, shared with rocketTurret, apache and destroyer.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.6 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Single unguided artillery rocket launching from a truck-mounted launcher, sharp ignition whoosh into a short motor roar that fades away.

### `rocketTankLaunch2`

- Page id: `rocketTankLaunch`; category: Unit / weapon SFX; key to register: `shootRocketTank`; one-shot.
- Intended trigger / code location: rocketTank burst: firingHandlers.js handleRocketBurstFire ~L279 / soundName 'shoot_rocket' (~L253) = patriotMissile01/02, shared with rocketTurret, apache and destroyer.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 1.6 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Single unguided artillery rocket launching from a truck-mounted launcher, sharp ignition whoosh into a short motor roar that fades away.

### `smallShipCruise`

- Page id: `smallShipCruise (loop)`; category: Unit / weapon SFX; key to register: `smallShipCruise`; LOOP.
- Intended trigger / code location: src/game/movementCore.js navalCruiseLoopEvent(): only battleship and hovercraft have loops. destroyer, supplyShip, vehicleFerry, navalMineLayer, aircraftCarrier are silent. Add key and one more branch.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 4.0 s | prompt_influence 0.5 | LOOP | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Seamless loop, constant level, no start or end transient. Mid-size warship diesel engines and bow wake at steady cruise, low rumble with water slapping the hull.

### `uiPartyJoin`

- Page id: `uiPartyJoin`; category: UI SFX; key to register: `uiPartyJoin`; one-shot.
- Intended trigger / code location: multiplayer presence: src/ui/multiplayerPresenceUi.js, src/ui/sidebarMultiplayer.js, src/network/hostNotifications.js (text only).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.8 s | prompt_influence 0.55 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Soft two-tone radio chime for a player joining a channel, friendly and brief.

### `uiTabSwitch`

- Page id: `uiTabSwitch`; category: UI SFX; key to register: `uiTabSwitch`; one-shot.
- Intended trigger / code location: build-bar tab switch (Buildings / Units): src/ui/productionControllerTabs.js ~L86-91. Silent today.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.25 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Quiet crisp plastic tab click with a very short soft electronic tick.

### `uiToggleOff`

- Page id: `uiToggleOff`; category: UI SFX; key to register: `uiToggleOff`; one-shot.
- Intended trigger / code location: Same toggles as uiToggleOn when switching off.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.3 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Small tactile switch clicking down with a faint falling electronic blip, very short.

### `uiToggleOn`

- Page id: `uiToggleOn`; category: UI SFX; key to register: `uiToggleOn`; one-shot.
- Intended trigger / code location: About 14 toggles (danger-zone map handleDzmToggle keyboardHandler.js ~L1078, tank-image toggle ~L1037-1168, volume slider volumeControl.js:34) re-use the spoken 'confirmed' line as feedback.
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 0.3 s | prompt_influence 0.6 | one-shot | 1 take
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Small tactile switch clicking up with a faint rising electronic blip, very short.

### `unitsBlocked`

- Page id: `unitsBlocked`; category: Announcer VO; key to register: `unitsBlocked`; one-shot.
- Intended trigger / code location: stuck crowd notice: src/game/stuckClusterNotification.js focusStuckUnits (text and camera focus only).
- Tool: ElevenLabs TTS (`eleven_v4`), default voice settings; voice Dave (`RF6N5izArqlUgNy6JsKW`)
- Spoken text: "Units are blocked."

### `waterMineBlast1`

- Page id: `waterMineBlast`; category: Unit / weapon SFX; key to register: `waterMineBlast`; one-shot.
- Intended trigger / code location: src/game/waterMineSystem.js (naval mines; damage only reports via notifyEntityUnderAttack, no sound).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Naval mine exploding just below the surface, deep muffled thump followed by a big water surge and bubbling.

### `waterMineBlast2`

- Page id: `waterMineBlast`; category: Unit / weapon SFX; key to register: `waterMineBlast`; one-shot.
- Intended trigger / code location: src/game/waterMineSystem.js (naval mines; damage only reports via notifyEntityUnderAttack, no sound).
- Tool: ElevenLabs Sound Effects v2 (`eleven_text_to_sound_v2`) - SFX v2 | 2.5 s | prompt_influence 0.6 | one-shot | 2 takes
- Prompt: Military RTS game sound effect, punchy and dry, close-mic, no music, no voice, no reverb tail, clean start and clean cut-off. Naval mine exploding just below the surface, deep muffled thump followed by a big water surge and bubbling.
