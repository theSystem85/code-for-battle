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
- Audio: voice volume = master volume × 0.95; background music is ducked to 25 % (`setMusicDuck`) and restored on close. Music on/off is untouched. If autoplay is blocked, pictures continue on the measured timings and a "Sound on" button appears.
- Performance: one transformed `<img>` in a fixed overlay while the simulation is paused; no per-frame canvas work is added.

## Landing page
- Hero reads headline-first (dateline, newspaper headline, game title), newspaper as hero image, existing CTAs.
- `#story` section: three theme cards (Kyronite power, AI war machines, front lines), CSS news ticker (stops under `prefers-reduced-motion`), "Play now" CTA. No `title` attributes, no nested scroll containers.
