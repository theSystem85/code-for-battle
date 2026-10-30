- [x] **HEVC-only milestone videos**
  Replaced all 16 current `public/video/*.mp4` milestone clips with HEVC Main files tagged `hvc1` (libx265 CRF 28, AAC only where the previous file had a soundtrack). Filenames stay `video/${base}.mp4`. Companion `.mp3` narration is unchanged, and `public/video/old/` is unchanged. The smaller download is Apple-first: macOS and iOS Safari play HEVC; some Chrome builds on Windows and Android may not. No H.264 dual fallback.
  Spec: [First-build milestone videos](../specs/090-first-build-milestone-videos.md)
