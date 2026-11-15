- [x] **Feature: ElevenLabs sound and voice pack wired into play**
  Weapon shots, building and economy cues, UI clicks, battlefield ambience, announcer lines, and unit acknowledgements now play from the 78-file pack, with throttling so groups and rapid fire do not stack voices.
  Spec: [ElevenLabs audio pack](../asset-sources/elevenlabs-audio-pack-2026-11-15.md)

Every file in the 2026-11-15 pack is registered in `soundFiles` as a one-shot or a rotating variant array. Triggers follow the manifest: class voices on select, move, and attack (one line per group), weapon and explosion effects only when the shooter is friendly or visible, and announcer lines on the existing stackable queue. Ambience follows the map biome, the effects volume, pause, and tab visibility. Mine blasts, crew restored, refuelling, and the empty error/cancel cues use registered files. The danger-zone, tank-image, and other keyboard toggles, plus the volume slider preview, use the new UI clicks instead of the spoken "confirmed" line.

`MineFieldCleared.mp3` stays unwired because the field-cleared announcer already speaks. `tankMove01.mp3` stays unwired because the tank drive loop already covers movement. `public/mine_explosion.mp3` stays unwired because the new mine-detonation variants are level-matched to the rest of the pack.

Qualifying-hardware 75 FPS acceptance is outstanding. This environment has no hardware GPU, so no software-only frame benchmark was run.
