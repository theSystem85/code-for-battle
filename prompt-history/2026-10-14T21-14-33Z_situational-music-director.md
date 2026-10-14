UTC: 2026-10-14T21-14-33Z (entry recorded during task; exact prompt receipt time unavailable)
Harness: Codex via API
Model: GPT-6; exact model variant/version and reasoning level are not exposed in this session. Input, visible-output and reasoning-token counts and exact task duration are unavailable and omitted.

## Repository instructions

The user supplied the repository's AGENTS.md instructions, including English prompt history and per-issue change notes, dedicated feature specs, versioned release notes, unit tests via npm run test:unit, lint:fix:changed after implementation, lint before commits, conventional commit text in the final response, local simulation-only music, and strict performance/rendering gates. The full supplied instructions are preserved in the repository's AGENTS.md.

## User prompt

You are working in a git repository checked out at the current directory (branch codex/implement-a-situational-backgrou-20261014-230920-482fb8, based on main).
Follow the repository's own instructions (AGENTS.md etc.) for code style, docs and tests, but do not commit, push, or change git remotes; the operator commits for you.
Stay inside this directory. Network access is disabled in the sandbox. Do not add secrets or credentials.
TASK:
Implement a situational background "music director" in this RTS game. Follow AGENTS.md rules (English only, lint clean, a per-issue note in docs/changes/, an English prompt-history entry like the existing ones, conventional commit). Read src/sound.js (random playlist of music01/music02 already exists) first.

New MP3 files will be added separately (do NOT create them, just reference them): public/sound/music/music_attack_motivational.mp3, public/sound/music/music_under_attack_danger.mp3, public/sound/music/music_defeat_sad.mp3 (each about 3 minutes, ElevenLabs generated).

Requirements:
1. New module (e.g. src/audio/musicDirector.js) with a PURE state selection function plus a small stateful director, states:
   - normal: the existing random playlist of music01/music02 (keep current behavior).
   - firstAttack: triggered the first time the local player's units attack (fire at / damage) an enemy unit or building; played at most once per game.
   - underAttackOutnumbered: the local player's units or buildings were damaged by enemies within the last ~10 s, AND the enemy combat units near the attack (e.g. within ~12 tiles of the damaged asset) outnumber the player's combat units in that radius, OR the player's total combat units are fewer than the attackers. Define it clearly in code comments and docs. Combat units = non-harvester, non-utility armed units.
   - nearDefeat: player has no construction yard AND (no refinery OR no harvesters) AND money below the cheapest buildable unit cost; OR the player has <= 2 buildings and nothing is producing and no combat units. Document the metric.
   - Priority: nearDefeat > underAttackOutnumbered > firstAttack > normal.
2. Crossfade between tracks over ~3.5 s (two Audio elements, volume ramps), situational tracks loop while active.
3. Hysteresis: minimum dwell of 50 s for any situational track, plus a 20 s cooldown after a switch before another switch (higher-priority nearDefeat may preempt dwell of lower ones, but still respect a short cooldown). After the situation clears, wait 15 s of clear condition before returning to normal. firstAttack plays for at least the dwell then returns to normal.
4. Respect the existing music toggle (paused/disabled = director does nothing audible), master volume, pause/resume, terminateAllSounds and headless automation mute in sound.js.
5. Use simulation time (game state time / timestamps used elsewhere in the sim) for dwell/cooldown, never gameRandom; music is local only (Math.random ok for playlist). Must not affect lockstep determinism (read-only on game state). Evaluate the director at a low rate (e.g. every 1 s of sim time) from the game loop or an existing update hook.
6. Hook up detection of "player attacked enemy" and "player got damaged" via existing damage/combat code paths in a minimal, read-only way (e.g. record last-event timestamps in a local module).
7. Unit tests in tests/unit/ for state selection, priority, firstAttack once-per-game, dwell, cooldown and clear-delay hysteresis.
8. Add docs/ASSET_CREDITS.md (or extend an existing credits file) listing music01.mp3 (Udio), music02.mp3 (ElevenLabs Music v2.5), and the three new tracks as generated with ElevenLabs Music v2.5, license per the owner's ElevenLabs plan.
Run lint and unit tests and make them pass.

## Follow-up (2026-10-14T22:10Z)

User prompt: "Ensure the music does not intersect when tone changes so the current one has to fade out first before the new song starts but new song does not need to fade in then. Ensure in the beginning no sad music is played."

Changes: replaced the crossfade with a sequential fade-out (3.5 s) followed by a full-volume start of the next track; added a start-of-game guard so near defeat requires a once-owned construction yard/refinery and at least 3 minutes of simulation time.
