- [x] **Feature: radar station milestone video with built-in sound**
  Building your first Radar Station now plays a 15 s HEVC clip (960×576, the radar's 5:3 shape) over the minimap: a slow dawn dolly-in on the radome with wind, hum, radar pings and the narrator line, all inside the video with no companion MP3.

The clip is `public/video/radar_station.mp4` and the `radarBuilt` milestone sets `videoFilename: 'radar_station'`. It uses the same embedded-audio path as `first_factory`: `radar_station` is listed in `EMBEDDED_AUDIO_ONLY_CLIPS` (`src/ui/milestoneAudioMode.js`) and has a full-frame `FULL_5X3` crop entry (`src/ui/milestoneVideoCrop.js`).
