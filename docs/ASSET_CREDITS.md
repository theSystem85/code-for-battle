# Asset Credits

## Tank V2 / Tank V3 images

- Files: `public/images/map/units/tankV2_{wagon,turret,barrel}.webp`, `public/images/map/units/tankV3_{wagon,turret,barrel}.webp` and the derived `public/images/prepared/unit/tankV2|tankV3/*`.
- Source: AI-generated on 2026-10-14 with the OpenAI image generation tool through the Codex CLI (ChatGPT account of the project owner), in one generation from the prompt in `docs/asset-sources/tank-v2-v3-leopard-prompt.txt`. The original sprite sheet is stored in `docs/asset-sources/tank-v2-v3-leopard-spritesheet.webp`.
- Post-processing: background keying, cropping, resizing and alignment by the project.

## Music

Background tracks in `public/sound/music/`:

| File | Source | Used for |
| --- | --- | --- |
| `music01.mp3` | Generated with Udio (license per the owner's Udio plan) | Normal playlist |
| `music02.mp3` | Generated with ElevenLabs Music v2.5 | Normal playlist |
| `music03.mp3` | Generated with ElevenLabs Music v2.5 | Normal playlist (Iron Veil) |
| `music04.mp3` | Generated with ElevenLabs Music v2.5 | Normal playlist (Marching Orders) |
| `music05.mp3` | Generated with ElevenLabs Music v2.5 | Normal playlist (Heavy Barrage) |
| `music_attack_motivational.mp3` | Generated with ElevenLabs Music v2.5 | First attack |
| `music_under_attack_danger.mp3` | Generated with ElevenLabs Music v2.5 | Under attack while outnumbered |
| `music_defeat_sad.mp3` | Generated with ElevenLabs Music v2.5 | Near defeat |

The three situational tracks were generated on the owner's ElevenLabs Starter plan, which includes a commercial music license. `music03.mp3`, `music04.mp3` and `music05.mp3` were generated on 2026-10-30 with ElevenLabs Music v2.5 (about 150 seconds each) and added to the normal playlist. Every ElevenLabs track carries the MP3 comment tag "Generated with ElevenLabs Music v2.5". All tracks are instrumental, 160 kbps / 48 kHz and loudness-matched to about -12 LUFS.

## App icons

- Files: `public/apple-touch-icon.png`, `public/android-chrome-192x192.png`, `public/favicon-256x256.png`, `public/favicon-512x512.png`.
- Source: AI-generated on 2026-10-15 with the OpenAI image generation tool through the Codex CLI (ChatGPT account of the project owner), in one generation from the prompt in `docs/asset-sources/app-icon-square-prompt.txt`. The native square source (1254×1254) is stored in `docs/asset-sources/app-icon-square-source.webp`.
- Post-processing: downscaling to each icon size by the project. The 16/32/48 favicons and `favicon.ico` keep the isolated front tank from the earlier icon set.

## Tank V1 images

- Files: `public/images/map/units/tankV1_{wagon,turret,barrel}.webp` and the derived `public/images/prepared/unit/tankV1/*`.
- Source: AI-generated on 2026-10-15 with the OpenAI image generation tool through the Codex CLI (ChatGPT account of the project owner), in one generation from the prompt in `docs/asset-sources/tank-v1-leopard-prompt.txt`, with the V2/V3 sprite sheet as style reference. The original sprite sheet is stored in `docs/asset-sources/tank-v1-leopard-spritesheet.webp`.
- Post-processing: background keying, cropping and resizing to the V2/V3 part sizes by the project.
- The previous V1 barrel is kept unchanged as `public/images/map/units/howitzer_barrel.webp` for the howitzer.

## Story newspaper and narration

- Image: `public/images/story/global-herald-2038.webp` (1536×1024) and `global-herald-2038-960.webp`. Source: front-page artwork supplied by the project owner (fictional "The Global Herald", June 12 2038). The project edited it in place with Pillow, without regenerating: the UN emblem, the "UN Secretary-General" attribution and "The United Nations" mention were replaced with the fictional Accord Council (original programmatic emblem, Source Serif Pro / Source Sans Pro text, SIL OFL fonts).
- Narration: `public/sound/story/herald_vo_01.mp3` … `herald_vo_08.mp3`, generated on 2026-10-15 with ElevenLabs text-to-speech (model `eleven_v4`, library voice "Atlas Morgan - Narration & News", voice id `08NAVeqzFfSo6Aw5128W`) on the owner's ElevenLabs Starter plan, which includes a commercial license. Loudness-normalized to -16 LUFS, mono 96 kbps by the project. Script: `src/story/storyIntroSegments.js`.
- Tutorial narration: `public/sound/tutorial/*.mp3` (35 clips), generated on 2026-10-15 with ElevenLabs text-to-speech (model `eleven_v4`, same library voice "Atlas Morgan - Narration & News", voice id `08NAVeqzFfSo6Aw5128W`) on the owner's ElevenLabs Starter plan, which includes a commercial license. One generation per clip, loudness-normalized to -16 LUFS, mono 96 kbps by the project. Script: `src/ui/tutorialSystem/narrationManifest.js`.

## Air and naval milestone videos

- Files: `public/video/{first_f35,first_f22,first_apache,first_destroyer,first_battleship,first_submarine,shipyard,helipad}.mp4`
- Source: AI-generated on 2026-10-15 with Grok Imagine (xAI), 15 s 720p, using the matching sidebar build icon as reference image. Prompts in `docs/asset-sources/milestone-videos-air-naval-prompts.md`. Center-cropped to 960×576 by the project.
- Shipped picture: HEVC Main in an MP4 tagged `hvc1` (libx265 CRF 28, yuv420p), silent. There is no H.264 fallback. Safari on macOS and iOS plays these files; some Chrome builds on Windows and Android do not.
- Narration: the matching `.mp3` files were generated with ElevenLabs (eleven_v4, voice "Dave") on the owner's ElevenLabs Starter plan, which includes a commercial license. Trimmed and loudness-normalized by the project.

## Milestone video encodes

Every current clip directly under `public/video/*.mp4` (16 files; `public/video/old/` is unchanged) is HEVC Main, tagged `hvc1`, libx265 CRF 28, yuv420p, at the same pixel size as the previous H.264 file. Most are 960×576. `tank_over_crystals.mp4` and `tesla_coil_hits_tank.mp4` are 1280×720. `air_strip.mp4` and `first_tank.mp4` still carry a stereo AAC soundtrack at about 128 kbps. The other fourteen picture files have no audio track. Companion `.mp3` narration files are unchanged. Playback still requests `video/${base}.mp4`. `first_factory.mp4` (added 2026-11-15) is also HEVC `hvc1` at 960×576 with built-in AAC sound and no companion `.mp3`; it was generated with Grok Imagine from the vehicle factory sidebar icon and center-cropped from 16:9 to 5:3. `radar_station.mp4` (added 2026-11-15) follows the same recipe: HEVC `hvc1`, 960×576, built-in AAC sound, no companion `.mp3`, generated with Grok Imagine (video) from the radar station sidebar icon as one continuous dolly-in shot and center-cropped from 16:9 to 5:3. `ten_buildings.mp4` and `harvester_unlocked.mp4` (added 2026-11-16) follow the same recipe: HEVC `hvc1`, 960×576, built-in AAC sound, no companion `.mp3`, AI-generated video by Grok Bot from the construction-yard and harvester sidebar icons and center-cropped from 16:9 to 5:3. `recovery_tank_unlocked.mp4` and `heavy_tank_unlocked.mp4` (added 2026-11-16) follow the same recipe: HEVC `hvc1`, 960×576, built-in AAC sound, no companion `.mp3`, AI-generated video by Grok Bot from the recovery-tank and tank-v3 sidebar icons and center-cropped from 16:9 to 5:3.

## Destroyer, battleship and aircraft carrier map sprites

- Files: `public/images/map/units/{destroyer_map,battleship_map,battleship_turret,battleship_barrel,aircraft_carrier_map}.webp` and their prepared 1x/2x/3x variants.
- Source: AI-generated on 2026-10-15 with Grok Imagine (xAI), 1280×720, one image per asset. Raw sources and prompts in `docs/asset-sources/ship-*`.
- Post-processing by the project with `docs/asset-sources/ship-build-assets.py`: chroma keying, cropping, lossless 90° rotation, carrier mirrored, Lanczos downscale to the DPR 3 backing size.

## ElevenLabs sound effects and voice pack (2026-11-15)

- Files: 78 MP3s added to `public/sound/` (2.5 MB): unit/weapon effects (`m2AutocannonBurst1-3`, `howitzerFire1-2`, `artilleryShellImpact1-2`, `rocketTankLaunch1-2`, `apacheRocketLaunch1-2`, `mineDetonation1-2`, `mineSweeperDefuse1-2`, `waterMineBlast1-2`, `depthChargeDetonation`, `apacheRotorSpoolUp`, `smallShipCruise`, `recoveryWinchHook`), building/economy effects (`buildingCollapse1-3`, `lowPowerAlarm`, `radarOnline`, `radarOffline`, `crewRestored`, `refuelPumpLoop`, `ammoReloadClunk`), UI effects (`error1-2`, `uiToggleOn`, `uiToggleOff`, `uiTabSwitch`, `achievementStinger`, `uiPartyJoin`), three ambience loops (`ambienceWindOpen`, `ambienceWindDesert`, `ambienceWindSnow`), ten announcer lines (`lowPower`, `powerRestored`, `insufficientFunds`, `radarOnlineVO`, `radarOfflineVO`, `ourUnitsUnderAttack`, `ourAircraftUnderAttack`, `aircraftLowFuel`, `unitsBlocked`, `enemySpotted`) and 28 unit acknowledgement / retreat lines (`ackSelectGround1-3`, `ackMoveGround1-3`, `ackAttackGround1-3`, `ackAir{Select,Move,Attack}1-2`, `ackNaval{Select,Move,Attack}1-2`, `ackSupport{Select,Move}1-2`, `retreatCall1-3`).
- Source: generated on 2026-11-15 with ElevenLabs on the owner's ElevenLabs Starter plan, which includes a commercial license. Sound effects: Sound Effects v2 (`eleven_text_to_sound_v2`), prompts quoted in `docs/asset-sources/elevenlabs-audio-pack-2026-11-15.md`; the three ambience beds and the two loop effects use the loop option. Announcer lines: text-to-speech model `eleven_v4`, voice "Dave" (voice id `RF6N5izArqlUgNy6JsKW`). Acknowledgement and retreat lines: text-to-speech model `eleven_v4`, library voice "Admiral Action - Military Man" (voice id `GLSWsaquVBsIPLPPRi2s`), short delivery tags only.
- Post-processing by the project (ffmpeg): silence trimming on one-shots, loop cross-fades, loudness normalization (announcer and acknowledgement lines -23 LUFS mono; effects level-matched per class), -3 dBFS limiter, MP3 128 kbps / 44.1 kHz (stereo effects, mono voice lines).
- Handoff / wiring spec: `docs/asset-sources/elevenlabs-audio-pack-2026-11-15.md` (id, path, category, trigger, sound key, loop flag, voice, prompt or text per file).

## Radar station map sprite (2026-11-15)

`public/images/map/buildings/radar_station.webp` (192×192, transparent background) was redrawn to match the sidebar build icon (`public/images/sidebar/radar_station.webp`): a white bunker with a cylindrical tower and a spherical radome. The source picture was generated with Grok Imagine (image) from the sidebar icon, the white background was removed to alpha by an edge flood fill, and a soft ground shadow was added. `originals/radar_station.png` is the full-resolution cutout with alpha and `originals/radar_station_old.webp` is the previous satellite-dish sprite. The prepared density variants under `public/images/prepared/building/radarStation/` were regenerated with `npm run make:prepared-sprites`.

## Fire system audio and artwork (2026-11-16)

- Audio: `public/sound/fireLoop.mp3` (8.0 s seamless loop), `public/sound/fireHoseLoop.mp3` (4.4 s seamless loop) and `public/sound/fireEngineReady.mp3` (2.4 s voice line "Fire engine ready. Standing by."). Generated on 2026-11-16 with ElevenLabs on the owner's ElevenLabs Starter plan, which includes a commercial license. Loops: Sound Effects v2 (`eleven_text_to_sound_v2`, loop option, 9 s and 5 s, one regeneration each after the first 1 s takes). Voice line: `eleven_multilingual_v2`, voice id `iAQ8JnVyb6JWIhvcjWww`. Loops cross-faded head to tail and loudness-matched by the project (ffmpeg); MP3 128 kbps / 44.1 kHz. IDs, prompts and processing: `docs/asset-sources/fire-audio.json`.
- Artwork: `public/images/map/units/fire_engine.webp`, `public/images/map/buildings/fire_department.webp`, `public/images/sidebar/fire_engine.webp` and `public/images/sidebar/fire_department.webp` were generated with the image generator available to Grok Bot from reference sprites of the project, background-keyed to alpha by the project and converted to WebP. The prepared density variants under `public/images/prepared/{unit/fireEngine,building/fireDepartment}/` were regenerated with `npm run make:prepared-sprites`. Prompts and processing: `docs/asset-sources/fire-art-prompts.md`; full-resolution cut-outs: `docs/asset-sources/fire-engine-map-source.webp` and `docs/asset-sources/fire-department-map-source.webp`.
