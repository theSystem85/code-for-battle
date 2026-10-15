# 2026-10-15T03:21:00Z

Grok Bot (executor agent; exact underlying model version and token counts not available to the harness).

## Prompt

Make the sound effects / music ratio default Music 50% / SFX 100%, and have the intro use the same balance. Make the intro narrator as loud as the tutorial narrator, which currently sounds about twice as loud: find out why, use the same gain chain, and normalise the clips if their loudness differs. Then merge the PR.

## Result

- Measured with ffmpeg ebur128 (integrated loudness): intro clips -16.7 to -17.5 LUFS, tutorial clips -16.5 to -17.8 LUFS. They are equally loud, so no normalisation was done.
- Cause: the tutorial played HTMLAudio and set `element.volume`, which iOS ignores, so on iPhone it played at full level. The intro used a Web Audio gain of 0.9 × master (0.25 by default) × balance, about 0.225, roughly 13 dB quieter.
- Fix: one chain for both narrators, NARRATION_GAIN 1.0 × master × effects side, with tutorial clips routed through a Web Audio gain node. The balance defaults to 25 (Music 50% / SFX 100%).
