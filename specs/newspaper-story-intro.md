# Newspaper story intro

## Source
- `public/images/story/global-herald-2038.webp` (1536×1024) and `-960.webp`: "The Global Herald", June 12 2038, "War erupts over mysterious blue crystals".
- The real UN emblem, the "UN Secretary-General" attribution and "The United Nations" in the Voices of Concern column were replaced in place (Pillow edit, not regenerated) by the fictional **Accord Council**: original crystal-in-ring emblem, "— Accord Council Secretary-General", "The Accord Council held an". All other pixels are unchanged.

## In-game intro (`src/story/`)
- Plays after the loading screen on first play only. Status (`seen` / `skipped`) is stored under `cfb-story-intro-v1` in game storage (IndexedDB with localStorage fallback).
- Never autoplays under automation (`navigator.webdriver`) or for remote multiplayer clients. `?storyIntro=1` forces it, `?storyIntro=0` suppresses it.
- Replay: "Replay war briefing" in the sidebar footer.
- Sequence (camera focus → clip): headline → main photo → "Global powers collide" → "Front lines across the globe" → "The power of Kyronite" → "AI war machines" → "Voices of Concern" + council quote → ticker.
- Each segment lasts its measured clip duration (ffprobe) + 450 ms; the camera eases to the next section over 1.6 s. Captions show the narration text.
- Skip: button, Esc, or tapping the newspaper. The game is paused during the intro; the tutorial starts only after the intro closes (`story-intro-closed` event).
- Audio: narration clips are decoded to AudioBuffers up front and played through the one shared Web Audio context (`loadNarrationBuffer` / `playNarrationBuffer` in `src/sound.js`), so once that context is unlocked every later section plays without another gesture (iOS blocks each new `HTMLAudioElement` outside a gesture). Voice volume = effects volume × 0.9; background music is ducked to 10 % (`setMusicDuck`) and restored on close. While the intro is open the game is paused but the music and audio context are exempt from the pause handler.
- Start intro button: the automatic first-launch intro ALWAYS opens on a prominent centered "Start intro" button with a visible hint line (no native `title` tooltip) over the dimmed first section. Lock detection is not used, because an earlier landing-page tap marks the page as user-activated while iOS still refuses media started outside a gesture. The timeline, narration and music only start on the press, which unlocks the shared context (resume + silent buffer), primes the music elements and starts narration and First Strike in that same gesture. Tapping the newspaper does not skip while waiting; Skip and Esc always skip. Intros opened by a click (the sidebar "Replay war briefing" link) start straight away. Every later gesture during the intro retries the music if it is not playing. Playback is logged to `window.__storyIntroAudioLog` (events `audio-locked`, `awaiting-start`, `intro-started`, `segment-playing`, `music-ramp`, `intro-closed`, with music gain, narration level, master and balance).
- Music bed and swell: under the narration the music duck is 0.1 of the music level, against narration at 0.9 of the effects level, so the bed is about 11 % of the narration amplitude (about -19 dB). During the last 7 s of the narration the duck rises with a smoothstep curve to 1 (full music level), then closing hands over to Battle Track 02 as before.
- Volume: narration follows master volume x the effects side of the SFX/music balance live (also while a clip plays); music follows master x the music side live, including the bed and the swell.
- Performance: one transformed `<img>` in a fixed overlay while the simulation is paused; no per-frame canvas work is added.

## Landing page
- Hero reads headline-first (dateline, newspaper headline, game title), newspaper as hero image, existing CTAs.
- `#story` section: three theme cards (Kyronite power, AI war machines, front lines), CSS news ticker (stops under `prefers-reduced-motion`), "Play now" CTA. No `title` attributes, no nested scroll containers.

## Music cues (`src/sound.js`, `src/story/storyIntroBoot.js`)
- First-launch (automatic) intro: "First Strike (Attack Theme)" (`music_attack_motivational.mp3`) is queued as a one-off cue through the music director's Web Audio path, ducked to 10 % under the narration and swelled to full level over the last 7 s and scaled by master volume. Replays from the sidebar do not change the music.
- The intro pauses the simulation; `setMusicPauseExempt(true)` keeps the pause handler from silencing the intro music until the intro closes.
- On close (skip or end) the first-gameplay cue "Battle Track 02" (`music02.mp3`) is queued: First Strike fades out for the full 3 s (`MUSIC_FADE_OUT_MS`) and Battle Track 02 then starts at full volume with no overlap. It plays once to its end, after which the director's normal behaviour (random playlist / moods) resumes; a mood change (outnumbered, near defeat) replaces it earlier with the usual fade.
- When no intro plays on the first launch, Battle Track 02 starts on the first pointer or key input (browsers block audio before a gesture). Stored once per device under `cfb-first-gameplay-music-v1` (set only once playback actually starts).
- Music toggle: cues turn music on unless the user explicitly switched it off with the sidebar toggle; that choice is stored under `cfb-music-user-off` (cleared by toggling on or by the next-song button).
- First-attack interaction: if the intro's First Strike cue started, the first attack of that session does not trigger the First Strike mood again (`suppressNextFirstAttackTheme`, consumed by the first attack, survives the director reset at game start). Later games get the first-attack theme as before; the outnumbered and near-defeat moods are never affected.
- If autoplay is blocked at launch, the Start intro button starts both the narration and the intro music. Media elements need a real user activation even where the Web Audio context already runs, so the music always waits for that activation. Music cues no longer wait for a random playlist track to load first.

## Tutorial narration (`src/ui/tutorialSystem/narration.js`)
- Clips: `public/sound/tutorial/*.mp3`, ElevenLabs `eleven_v4`, voice "Atlas Morgan - Narration & News" (`08NAVeqzFfSo6Aw5128W`, the intro narrator), plain text without audio tags, one take per clip, normalized to -16 LUFS mono 96 kbps.
- Manifest: `src/ui/tutorialSystem/narrationManifest.js` maps step id → file, with the exact spoken text and duration. A step's spoken text depends on the preferred input method and layout, so a step can have several clips (e.g. `resources-1` … `resources-4`). Covered: every step for mouse + keyboard, touch and trackpad in desktop and touch layouts, steps shared with gamepad, plus the two completion lines.
- A clip plays only when the tutorial is about to speak exactly the manifest text for that step. Otherwise (gamepad-specific wording with button names, custom key bindings, edited copy, non-English `<html lang>`), or when the file fails to load or playback is rejected, the existing browser TTS speaks the text.
- Music is ducked to 35 % while a clip plays and restored when it ends or the step changes. The speech toggle and the tutorial's stop/skip stop clips as well as TTS. A selected TTS voice applies only to the fallback.

## Sound effects / music ratio

- Settings > Runtime Config > Audio has a "Sound effects / music ratio" slider (0-100, step 5, default 50 "Equal"), persisted under `cfb-audio-mix-balance`, with a custom hover/focus tooltip.
- Music scale = min(1, balance / 50); effects scale = min(1, (100 - balance) / 50). Effects are sound effects, intro and tutorial narration and milestone video audio. Both sides stay under the sidebar Volume (master) slider and are applied live.
