# 2026-11-20T00:39:46Z

Model: Grok 4.7
Harness: Cursor Cloud Agent

## Prompt

Follow-up for the same branch and PR #806, kept unmerged. Restore the pre-v3 versions of the 79 regenerated sound effects from the parents of commits 354b1d91 and 78e7cdbe into a parallel location so both versions ship. Use the sound-effects prompt mapping to know which files have a pair, and keep the mapping, its guard test, and the catalogue coverage test consistent. In the Audio tab, every paired row gets a New checkbox that switches the version the game plays and the version the row preview plays, without a reload when practical. Persist each choice in IndexedDB and load it before sounds are first resolved. Default every sound to the old version. Add a Download config button at the end of the Audio tab. Move the Settings close button to the top-right of the modal and check desktop and mobile portrait. The choice stays client-only and must not affect simulation, replays, or multiplayer. Keep lazy loading and sensible offline caching. Update docs and release notes. Run lint, unit tests, and the build. Rebase onto origin/dev before pushing the feature branch. Take screenshots. Report the new head commit and deploy preview status.
