# code-for-battle brainstorm and to-do list

This is Patrick's and Grok Bot's shared list of ideas for code-for-battle that are still being brainstormed. It lives in the game repo at `docs/brainstorm.md`. **Grok Bot alone** manages this file.

Rules:
## Open ideas

### B-001: Voice commands (voice mode, stage 1)
The player controls the game by speaking: giving orders to units and expanding the base by voice, for example "build a refinery", "send my harvester to the nearest ore field" or "send it back to base when attacked". Voice mode must not get its own command logic. It reuses the same high-level command set that the unit automation scripts already use, so voice and automation share one vocabulary and one execution path, and any new automation command is automatically available by voice too. Spoken phrases map to commands through a command list that players can edit in a configurator. Each command can have several synonyms or alternative phrasings, and the configurator shows which phrases trigger which command. Commands act on the current selection or on units named in the sentence ("my harvester", "all tanks"), with sensible defaults such as nearest or idle units. Recognising speech and running commands works without a large language model; programming automations by voice is the separate idea B-002. B-003 builds on this command side.
- Added 2026-10-17.

### B-002: Program automations by voice (voice mode, stage 2)
The player creates or changes unit automation scripts by speaking. For example, "whenever a harvester is attacked, send it back to base and send two tanks to defend it" becomes a saved automation rule. Turning free-form speech into automation rules runs through a large language model, which translates the request into the existing automation format: conditions, triggers and the shared high-level commands from B-001. The player then reviews and confirms the result before it becomes active. This is its own feature, independent of B-001. It can ship separately and doesn't block stage 1, though both use the same command set.
- Added 2026-10-17.

### B-003: Audio/Blindmodus
A mode for playing the whole game by audio alone, with the screen off, for example phone in pocket and headphones in, or playing in bed before sleep. It's also accessible to blind players. It works in both directions. Input is voice commands, building on B-001. Output is the game speaking back what's happening, so the player can react: attacks, units lost or finished, buildings completed, resources running low, enemy sightings and the results of commands. Announcements should be prioritised and kept short so the player isn't flooded. In this mode, rendering can be switched off completely. The game then runs headless, with only logic, physics and everything else that matters for gameplay still running, and no drawing at all, which also saves battery. The name has a slash because it covers both meanings: speech in and out ("Audio"), and play with the screen off ("Blind").
- Added 2026-10-17.
- Research on similar games (2026-10-17):
  - Radio General (Steam, released April 9, 2020, by Foolish Mortals Games, designer Michael Long): a WWII real-time strategy game where you don't see your units. You give orders by voice over the radio and get spoken reports back. This is the closest match.
  - SoundRTS: a free audio-only RTS for blind players in the style of Warcraft. Orders are given with the keyboard and feedback comes through text-to-speech, with no voice commands.
  - Necromancer Nonsense (itch.io): a free blind-playable RTS with screen-reader support, audio cues, an event log, pause and adjustable speed. It uses the keyboard, not voice.
  - Battle Field Marshal (Dreamsound Games): a fully self-voiced, audio-first tactical strategy game. It's turn-based and has no voice commands.
  - Land and Crown (iOS): a medieval multiplayer strategy game built for VoiceOver, where a narrator announces events. It's a slow-paced game played on the phone, not a voice-controlled RTS.
  - Darkness Falls and The Bard's Tale: Warlocks of Largefearn (Alexa): RPGs played entirely by voice with no screen.
  - Tom Clancy's EndWar and There Came an Echo: strategy games with voice commands that still need the screen.
  - No known RTS combines voice commands in, spoken feedback out, and rendering that can be switched off. That's the gap this mode would fill.

### B-004: LLM through the player's subscription (OpenAI sign-in)
An optional way to power the game's large language model features, such as voice-programmed automations (B-002) or LLM-driven AI, through the player's own OpenAI ChatGPT subscription instead of API quota or an API key. The player clicks "Sign in with ChatGPT" in the game's settings. That starts OpenAI's OAuth flow (Authorization Code with PKCE, a public client with no client secret, so it works in a browser game hosted on Netlify), and the player agrees to let the game use their ChatGPT plan. The game keeps the returned tokens only on the player's device, refreshes them automatically, and sends its model requests to OpenAI's Responses API with that access token. Usage counts against the player's plan, and the player can set a weekly limit for the game and disconnect it at any time in ChatGPT's settings. The game must never depend on this feature. Without a subscription, or when the player is signed out, everything works as now, and LLM features are either hidden or fall back to the existing route. Sign-in state, a disconnect button and clear errors (plan not eligible, limit reached) appear in the settings.
- Added 2026-10-17.
- Research (2026-10-17):
  - OpenAI: "Sign in with ChatGPT" is live. Go, Plus and Pro users can let participating apps use their plan with no API key. Plan usage is open to all open-source projects, which fits since code-for-battle is public. Closed-source commercial apps are only in a limited trial. The scopes are `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`. Docs: https://developers.openai.com/siwc/quickstart
  - xAI: there is OAuth sign-in for SuperGrok and X Premium+ subscriptions, used by Warp, Kilo Code, OpenCode, OpenClaw and Hermes Agent. But xAI only accepts approved partner clients, so the game would need to be added by xAI first. Some tiers still return a 403 error after signing in. It's a possible second provider later, not something we can use now.
  - Anthropic (Claude): not allowed. Since February 2026, Anthropic's terms say Pro and Max OAuth is only for its own apps, and third-party apps may not offer Claude login or route requests through subscription credentials. Claude would only work with a paid API key.

### B-005: LLM integration for automation mode
The automation mode gets a complete large language model integration. The game can already have an LLM control the AI player, but automation isn't connected to it yet. The goal is that an LLM can take over all automation: controlling units (moving, attacking, defending, harvesting, retreating) and automating base expansion (what to build, where and when). It works through the same high-level automation commands that scripts and voice commands use (see B-001), so the LLM, scripts and voice share one command set, and it reuses the existing LLM control path rather than adding a second one. This is different from B-002: there, the LLM writes automation rules from speech, while here the LLM runs the automation itself. It can draw on the player's subscription through B-004.
- Added 2026-10-17.

### B-006: Decision model (System One) integration
Add a decision model, a fast "System One" style model that reacts directly instead of reasoning in text. The reference and inspiration is Jeff, the first well-known decision model, but it doesn't have to be Jeff itself: another open-source decision model will probably be used. Over time the decision model takes over the part the large language model handles today, which is mainly unit control, because it would be much better and more efficient at fast, frequent control decisions than the current LLM approach. After that, the LLM is only used to commentate on game events. The decision model drives units through the same shared high-level command set (see B-001 and B-005).
- Added 2026-10-17.

### B-007: Dev branch workflow
Add a `dev` branch alongside `main` in the code-for-battle repo. Patrick decides when we switch modes. While he hasn't said otherwise, work goes through `main` as now: feature branches, draft PRs, and merges only when he asks. Once he says to work against dev, Grok Bot (and Codex) open PRs into `dev` that are auto-merged once conflicts are resolved (see B-007 decisions, which supersede the original direct-commit idea), still following the usual repo rules (conventional commits, lint and tests before every commit, docs and prompt-history entries). Netlify deploys every commit to `dev` live automatically, so no PRs are needed in that mode. `main` stays untouched while we work on dev. Every so often, when everything on dev has gone well and Patrick asks, dev is merged into main to bring them back in sync, again only when he says so. He also decides when to switch back to main.
- Added 2026-10-17.

### B-008: Hot code push in dev mode (continuous delivery on steroids)
Single-player hot code push, with Grok Bot as the coding partner while Patrick plays. He plays a single-player game, talks to Grok Bot while playing, points at a spot or thing in the game, and says what should change. Grok Bot makes the change and commits it to dev (B-007), and Netlify deploys it. Then the running game shows that an update has arrived, loads the changes, and Patrick can test them right away in the same match without reloading. To make that work, the game is refactored into modules that stay real production code (built, minified and as fast as normal). The running game notices a new deploy, for example by polling a small version or build manifest that each deploy publishes, fetches only the changed module files in the background, and swaps them in. The hard, still unsolved part is doing that swap safely. The likely approach is to keep the game state (units, buildings, map, resources) as plain data separate from the logic modules, swap modules only at a safe point between simulation ticks, give each module a way to hand over or rebuild its internal state, and fall back to saving the game, reloading and restoring it when a change can't be applied live. Pointing at a spot needs a way to pass the location or selected object to Grok Bot, for example map coordinates or a unit or building ID.
- State migration (hard requirement): when the shape of the game state changes between versions, for example new fields, renamed properties or restructured data, the running game must notice it and migrate the live state during play, not just reload. The state carries a schema version, and each deploy ships migration functions that take it from the old version to the new one. These run at the safe swap point, before the new modules take over. Without this, hot code push can't work across breaking state changes.
- Decision rules: there's no fixed threshold for what counts as a breaking change. For each change, the coding agent (Grok Bot) decides whether it can be hot-swapped safely or is a break, and records that decision in the deploy's update manifest. While the game is running, the player is always told when a new update is available to load by hot code push. A safe update just loads on its own. A breaking update needs the player's consent first. The notice appears as a pop-up, a small bubble at the top, or in the update info already in the left sidebar, and it says whether the update needs a reload.
- Added 2026-10-17. Scope set to single-player only on 2026-10-17. Clarified 2026-10-18: "single-player" includes local games against any number of AI enemies (even when the player is shown as Host); only network multiplayer with other human players is out of scope.
- Later idea, not in scope now: hot code push in multiplayer, where all players would have to switch at the same tick. It would be great, but it's too complicated for now. Revisit later.


### B-009: Ammunition production system
A full ammo economy layered on sulfur (yellow crystals), silos, the existing ammo fab, typed ammunition, weight-limited ammo trucks, and TNT-equivalent build costs.

1) **Sulfur harvest.** The player harvests yellow crystals (sulfur) with normal harvesters (same harvester units as ore/other resources).
2) **Silos.** Sulfur crystals can be stored in silos. Silos may be built up to 4 tiles away from other base buildings (placement radius / adjacency rule).
2.1) Silos must be buildable. Generate an image for the build button of an ammo silo (WebP 85% when implementing).
2.2) When a silo is destroyed it makes a blast as big as the one from the gas station.
2.3) Only when a **filled** silo is present can the player start building ammunition of different types.
2.4) The **ammo fab** (already existing) is responsible for ammo production. Ensure it gets a radial build menu like the vehicle fab has, but for ammunition types.
2.5) **Build-bar tab cycle.** The ammo build button gets a new separate tab in the build bar, similar to the 2 existing ones (buildings and units). When the player clicks the tab control it cycles through all 3 options: buildings → units → ammo → (repeat). The ammo tab exposes the ammunition build buttons / radial ammo fab production UI.
3) **Ammunition types** (every ammo type needs an image for the build button when implementing):
3.1) SAM (surface-to-air missile): used by rocket tank, rocket turret, destroyer.
3.2) Submarine torpedo.
3.3) Sea mines.
3.4) Land mines.
3.5) Artillery shells: used by battleship, howitzer, artillery gun.
3.6) Tank shells 120mm: used by all 3 tank versions and the destroyer main cannon.
3.7) Hellfire rockets: used by Apache.
3.8) AIM-120: F22 air-to-air rockets, radar guided (up to 6 per F22).
3.9) GBU-32 JDAM guided bombs for ground attacks: F22/F35 (up to 2 per F22, up to 6 per F35).
3.10) M919 rounds: used by M2 Bradley.
4) **Ammo truck logistics.** The ammo truck can load all different types of ammo at the same time but is limited by **weight**. Use real-world weight of each unit of ammo so max capacity is determined by the total weight of loaded ammo units. The player must see all loaded ammo types by number, sorted top-down, in a tooltip when hovering the ammo truck; on mobile, long-press/tap shows a bubble that when selected opens the same tooltip.
4.1) Research and apply real-world **prices** and **weights** for each ammo unit. Store them in a JSON file that can be loaded and updated easily.
5) **Build cost = sulfur as TNT equivalents.** Building ammo costs only sulfur, measured in TNT equivalents. The total TNT-equivalent amount is shown only in the tooltip over the ammo fab or the silo. Find a good correlation factor between real-world costs and the game's imaginative TNT equivalents so costs map sensibly.
6) **Truck-to-truck transfer (manual only).** Ammo trucks can transfer ammo between each other, but never automatically. When truck A is selected and truck B is clicked as the target, truck A loads its ammo into truck B until B is full or A is empty.

Open research / design still needed before implementation: real-world weights and prices table; TNT-equivalent correlation factor; silo capacity and "filled" definition; exact placement rules relative to base buildings; radial menu parity with vehicle fab; build-bar 3-way tab cycle UX; mobile long-press bubble UX.
- Added 2026-10-29.
- Status: open — brainstorm only; do not implement until Patrick asks.


### B-010: Production building spawn progress bar
When a production building is actively producing a unit, show a small **blue** progress bar on that building. If multiple production buildings of the same kind (or sharing a queue) are present, **only** the building that will actually **spawn** the produced unit shows the progress bar — the others must not show a bar for that same production.
- Added 2026-10-29.
- Status: open — brainstorm only; do not implement until Patrick asks.

## Done (moved to the repo)

(none yet)

### B-007 decisions (2026-10-18) — start only AFTER #688 is merged to main, then start automatically
1. Netlify deploys only `dev` as a branch deploy (no other branches).
2. No CI tests on dev; the developing AI runs lint, unit and e2e tests locally before every push (state this in AGENTS.md).
3. All agents (me + Codex) still open PRs into dev, and they are merged automatically into dev once conflicts are resolved. No Netlify deploy previews for PRs targeting dev; only dev itself deploys on merge.
4. dev -> main = release: version bump + git tag, all dev commits kept (no squash). Document in an AGENTS.md "Deployment" section.
5. Version label stays as is (PR-number based).
6. Branch deploys/dev get a fully separate backend (separate Upstash Redis DB/keys).
7. Patrick switches modes in chat; Codex is only prompted via Grok Bot, so Codex PRs must target dev in dev mode.
8. Turn on GitHub branch protection for main.
Extra: every PR description has a manual test plan table (#ID per step, clickable checkbox, covers all features/fixes/improvements, last two columns = count of unit and e2e tests covering it). Every unit test gets ID U00001-style, every e2e test E00001-style; retrofit all existing tests. Document in AGENTS.md. Plus the versioning/release proposal (build-time version from unreleased files, `npm run release`, "make a release" skill).
- Release flow (approved 2026-10-18): PR dev->main, rebase-merge, tag on main, then force-push dev to main right after (only if nothing new landed on dev). Test IDs go in test names, e.g. it('[U00042] ...').
- Backend separation (2026-10-18): same Upstash DB 'code-for-battle', all dev keys prefixed 'dev:' via a branch-deploy-only env var; production unprefixed.