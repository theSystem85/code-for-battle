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
| `music_attack_motivational.mp3` | Generated with ElevenLabs Music v2.5 | First attack |
| `music_under_attack_danger.mp3` | Generated with ElevenLabs Music v2.5 | Under attack while outnumbered |
| `music_defeat_sad.mp3` | Generated with ElevenLabs Music v2.5 | Near defeat |

The three situational tracks were generated on the owner's ElevenLabs Starter plan, which includes a commercial music license. Every ElevenLabs track carries the MP3 comment tag "Generated with ElevenLabs Music v2.5". All tracks are instrumental, 160 kbps / 48 kHz and loudness-matched to about -12 LUFS.

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
- Source: AI-generated on 2026-10-15 with Grok Imagine (xAI), 15 s 720p, using the matching sidebar build icon as reference image. Prompts in `docs/asset-sources/milestone-videos-air-naval-prompts.md`. Re-encoded and center-cropped to 960×576 by the project.
- Narration: the matching `.mp3` files were generated with ElevenLabs (eleven_v4, voice "Dave") on the owner's ElevenLabs Starter plan, which includes a commercial license. Trimmed and loudness-normalized by the project.

## Destroyer, battleship and aircraft carrier map sprites

- Files: `public/images/map/units/{destroyer_map,battleship_map,battleship_turret,battleship_barrel,aircraft_carrier_map}.webp` and their prepared 1x/2x/3x variants.
- Source: AI-generated on 2026-10-15 with Grok Imagine (xAI), 1280×720, one image per asset. Raw sources and prompts in `docs/asset-sources/ship-*`.
- Post-processing by the project with `docs/asset-sources/ship-build-assets.py`: chroma keying, cropping, lossless 90° rotation, carrier mirrored, Lanczos downscale to the DPR 3 backing size.
