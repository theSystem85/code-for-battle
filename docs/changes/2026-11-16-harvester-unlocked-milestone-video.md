- [x] **Feature: harvester unlock milestone video with built-in sound**
  Unlocking the harvester (vehicle factory plus ore refinery) now plays a 15 s HEVC clip (960×576, the radar's 5:3 shape) over the minimap: a slow golden-hour push-in on a fully parked sand-colored harvester beside glowing ore crystals, with the narrator line inside the video and no companion MP3.

The clip is `public/video/harvester_unlocked.mp4` and the `harvesterUnlocked` milestone sets `videoFilename: 'harvester_unlocked'`. It uses the same embedded-audio path as `first_factory`: `harvester_unlocked` is listed in `EMBEDDED_AUDIO_ONLY_CLIPS` (`src/ui/milestoneAudioMode.js`) and has a full-frame `FULL_5X3` crop entry (`src/ui/milestoneVideoCrop.js`).
