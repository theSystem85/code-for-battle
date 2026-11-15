- [x] **Feature: heavy tank unlock milestone video with built-in sound**
  Unlocking the heavy tank (two vehicle factories) now plays a 15 s HEVC clip (960×576, the radar's 5:3 shape) over the minimap: a slow head-on golden-hour push-in on a parked desert-camo heavy tank on dry grassland, with the narrator line inside the video and no companion MP3.

The clip is `public/video/heavy_tank_unlocked.mp4` and the `tankV3Unlocked` milestone sets `videoFilename: 'heavy_tank_unlocked'`. It uses the same embedded-audio path as `first_factory`: `heavy_tank_unlocked` is listed in `EMBEDDED_AUDIO_ONLY_CLIPS` (`src/ui/milestoneAudioMode.js`) and has a full-frame `FULL_5X3` crop entry (`src/ui/milestoneVideoCrop.js`).
