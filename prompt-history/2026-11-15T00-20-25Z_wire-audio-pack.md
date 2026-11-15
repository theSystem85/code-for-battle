# Prompt History
- UTC Timestamp: 2026-11-15T00:20:25Z
- LLM: Grok 4.7 (Cursor cloud agent)

## Prompt
In code-for-battle (branch dev, tip de544272 or later): 78 new MP3s were added to public/sound/ by commit `feat(audio): add ElevenLabs sound effect and voice pack`. The handoff spec is docs/asset-sources/elevenlabs-audio-pack-2026-11-15.md (id, file, category, intended trigger/code location, sound key to register, loop vs one-shot, voice, prompt). Wire ALL of them into the game:

1. Register every key in `src/sound.js` `soundFiles` (multi-variant packs as arrays so variants rotate/randomize like existing keys).
2. Hook each sound at the trigger the manifest names (unit/weapon fire, building/economy events, UI clicks/toggles/tab switch, announcer lines, unit acknowledgements on select/move/attack per unit class incl. naval/air, retreat lines). Respect existing volume categories (SFX vs narration), mute, cooldowns/throttling so repeated events don't spam (e.g. rapid fire, many units selected -> one ack), and spatial/visibility rules existing sounds use (only play enemy-side sounds when visible/in range, like existing code).
3. Ambience loops: add a lightweight ambience manager (start/stop/crossfade with game state, honour SFX volume, pause when game paused/tab hidden).
4. Free fixes from the audit: play `public/mine_explosion.mp3` (or the new pack sound if better) when a mine detonates; fill the empty `error` and `cancel` keys so `playSound('error')` no longer falls back to a synthetic beep; re-enable `crewRestored` in ambulanceSystem.js (~L230) and the refuel sound in gasStationLogic.js (~L33) with registered keys; replace the spoken 'confirmed' line used as click feedback for the danger-zone toggle, tank-image toggle and volume slider with the new UI toggle/click sounds; decide on unreferenced MineFieldCleared.mp3 and tankMove01.mp3 (wire them if a fitting trigger exists).
5. Add unit tests for registration (every file in the manifest is registered and exists; every registered key is referenced) and for throttling of acknowledgements, following the repo's test ID conventions.
6. Add a release-note entry per the repo's features/*.json convention (feature: new sound effects and voice lines).

Use conventional commits in English. Do not edit docs/brainstorm.md. Before pushing, run lint, unit tests, and the exact Netlify build `npm ci --include=dev && npm run build && npm run test:smoke`; all must pass. Commit and `git push origin HEAD:dev` directly (no PR). Rebase on origin/dev before pushing if needed. Report the new tip SHA via `git ls-remote origin dev`, a table of which keys are wired where, and anything intentionally left unwired with the reason. If the push is rejected, paste the exact error.
