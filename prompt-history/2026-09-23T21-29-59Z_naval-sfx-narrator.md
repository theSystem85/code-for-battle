# 2026-09-23T21:29:59Z

**LLM:** Cursor Cloud Agent using Grok 4.7
**Harness:** Cursor Cloud Agent
**Tokens / duration:** exact input, output, and reasoning token counts are not available from this run. Wall clock from the prompt timestamp 2026-09-23T21:25:00Z to 2026-09-23T21:37:04Z was about 12 minutes. `npm run lint:fix:changed` passed. `npm run test:unit` passed 182 files / 4133 tests. 75 presented FPS was not certified: this session is headless.

## Prompt

Integrate new naval sound effects and narrator VO into the game. New branch + open a PR when done.

## Attached assets
Extract `uploads/naval-sfx-pack.tar.gz` (or wherever the attachment lands). It contains MANIFEST.md plus these MP3s — copy every `.mp3` into `public/sound/` with the same filenames.

SFX:
- submarineSurfacing.mp3 — play when a submarine finishes surfacing
- submarineDiving.mp3 — play when a submarine finishes diving/submerging
- submarineTorpedo.mp3 — play when a submarine fires a torpedo
- battleshipCruise.mp3 — movement loop while a battleship is moving (same pattern as existing tank drive / apache fly loops via playPositionalSound with playLoop)
- battleshipFire1.mp3, battleshipFire2.mp3, battleshipFire3.mp3 — battleship gun fire; pick one at random each shot
- shipSinking.mp3 — play when any naval unit sinks/dies
- hovercraftMoving.mp3 — movement loop while a hovercraft is moving (~20s)

Narrator VO (same style as existing ourBaseIsUnderAttack / ourHarvestersAreUnderAttack — stackable narrated lines):
- ourBattleshipGotAttacked.mp3 — "Our battleship got attacked"
- ourSubmarineGotAttacked.mp3 — "Our submarine got attacked"
- ourCarrierGotAttacked.mp3 — "Our carrier got attacked"
- ourHovercraftGotAttacked.mp3 — "Our hovercraft got attacked"
- ourShipsGotAttacked.mp3 — "Our ships got attacked" (use for destroyer and any other naval unit that is not battleship/submarine/carrier/hovercraft)

Map unit types carefully: game likely uses `aircraftCarrier` for carrier and `hovercraft` for hovercraft. Verify in tech tree / unit defs.

## Wiring expectations
1. Register every file in `src/sound.js` (soundFiles + any narrated-queue lists used by existing under-attack VO).
2. Sub surface/dive: hook depth-state transitions in naval fleet / submarine logic (surfacing/submerging complete).
3. Torpedo: on submarine torpedo fire.
4. Battleship cruise + hovercraft move: positional loops while moving, stop when idle (mirror tank/apache pattern).
5. Battleship fire: random among the 3 variants on each shot.
6. Ship sinking: on naval unit death/destruction.
7. Attack narrator: extend `src/game/attackNotifications.js` (or equivalent) so when the local player's naval unit is under attack, play the matching VO (like base/harvester today) instead of UI-text-only. Cooldown/dedupe should match existing under-attack VO behavior.

## Done when
- Assets live under public/sound/
- Sounds play for all 7 categories above
- Branch created and PR opened against main
- PR description lists assets, wiring points, and a short how-to-test checklist for naval units

Investigate the existing audio patterns yourself; prefer matching them over inventing a new system. Do not commit MANIFEST.md unless useful; commit only the mp3s and code changes.
