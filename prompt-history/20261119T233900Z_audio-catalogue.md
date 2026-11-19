# 2026-11-19T23:39:00Z

**LLM:** Grok 4.7
**Harness:** Cursor Cloud Agent

## Prompt

Add an Audio Catalogue tab to the in-game Settings menu. The player can browse, lazy-load and listen to every shipped sound effect, music track and narration or voice file, each with a description of when it is used. Include a player with play/pause, stop, seek, amplitude, and a waveform/spectrogram toggle. Group entries into collapsible sections. Keep the catalogue in one place and add a unit test that fails if a shipped audio file is missing, plus an AGENTS.md / skill note. Work from latest dev on a feature branch, run lint, unit tests and the Netlify production build, rebase onto origin/dev, push, and open a pull request into dev without merging. Capture desktop and mobile-portrait screenshots.

## Result

- Added `src/audio/audioCatalogue.js` (253 entries), the Settings Audio tab, a Web Audio preview player with waveform and spectrogram, and `tests/unit/audioCatalogue.test.js`.
- Playback and the catalogue module load only after the Audio tab is opened, and a file is fetched only when that entry is played. Closing Settings stops playback.
- Documented the catalogue requirement in AGENTS.md, the new-unit skill and the README.
