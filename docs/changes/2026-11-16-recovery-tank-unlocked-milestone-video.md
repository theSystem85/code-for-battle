- [x] **Feature: recovery tank unlock milestone video with built-in sound**
  Unlocking the recovery tank (vehicle workshop) now plays a 15 s HEVC clip (960×576, the radar's 5:3 shape) over the minimap: a slow golden-hour push-in on a parked desert-camo recovery tank with a front tow hook and chains and a damaged tank behind it, with the narrator line inside the video and no companion MP3.

The clip is `public/video/recovery_tank_unlocked.mp4` and the `recoveryTankUnlocked` milestone sets `videoFilename: 'recovery_tank_unlocked'`. It uses the same embedded-audio path as `first_factory`: `recovery_tank_unlocked` is listed in `EMBEDDED_AUDIO_ONLY_CLIPS` (`src/ui/milestoneAudioMode.js`) and has a full-frame `FULL_5X3` crop entry (`src/ui/milestoneVideoCrop.js`).
