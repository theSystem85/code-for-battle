- [x] **Feature: ten-building industrial complex milestone video with built-in sound**
  Reaching ten buildings now plays a 15 s HEVC clip (960×576, the radar's 5:3 shape) over the minimap: a slow high aerial glide over a desert base with a dome construction yard and crane, with the narrator line inside the video and no companion MP3.

The clip is `public/video/ten_buildings.mp4` and the `tenBuildings` milestone sets `videoFilename: 'ten_buildings'`. It uses the same embedded-audio path as `first_factory`: `ten_buildings` is listed in `EMBEDDED_AUDIO_ONLY_CLIPS` (`src/ui/milestoneAudioMode.js`) and has a full-frame `FULL_5X3` crop entry (`src/ui/milestoneVideoCrop.js`).
