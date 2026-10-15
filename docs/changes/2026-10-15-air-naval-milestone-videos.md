# Air and naval milestone videos

Eight new first-build milestone videos with narration, wired through the existing milestone player (fade, playsinline, music ducking, master volume, top-left in condensed portrait / minimap spot otherwise).

| Milestone id | Trigger (local player) | Video base |
| --- | --- | --- |
| `firstF35` | unit `f35` | `first_f35` |
| `firstF22` | unit `f22Raptor` | `first_f22` |
| `firstApache` | unit `apache` | `first_apache` |
| `firstDestroyer` | unit `destroyer` | `first_destroyer` |
| `firstBattleship` | unit `battleship` | `first_battleship` |
| `firstSubmarine` | unit `submarine` | `first_submarine` |
| `firstShipyard` | building `shipyard` | `shipyard` |
| `firstHelipad` | building `helipad` | `helipad` |

- Videos: Grok Imagine, 15 s, 720p 16:9, sidebar build icon as reference image. Center-cropped to 960×576 (5:3), H.264 High, 24 fps, yuv420p, ~1.8 Mbit/s, no audio, faststart. Full-frame crop entries in `milestoneVideoCrop.js`.
- Narration: ElevenLabs eleven_v4, voice "Dave" (same as existing milestone VO), 12.8–14.6 s, mono 44.1 kHz 128 kbps, -23 LUFS like the existing clips.
- Units also replace the first unit-ready sting with the narration, and production start preloads the clip, like the existing first-unit milestones.
- Prompts: `docs/asset-sources/milestone-videos-air-naval-prompts.md`.
- Tests: `tests/unit/milestoneAirNavalVideos.test.js`.
