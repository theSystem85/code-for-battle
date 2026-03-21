# LLM Strategic AI & Commentary Integration

## Overview
Introduce configurable LLM support for enemy strategic planning and optional enemy commentary. The system integrates with the `ai-api` control protocol, lets players supply API keys and model selections per provider, and tracks token usage + cost per session.

## Goals
- Allow players to enable/disable LLM strategic control of the enemy AI.
- Provide optional “mean opponent” commentary with configurable prompt override and TTS voice selection.
- Fetch model lists from provider APIs (OpenAI, Anthropic, xAI, Ollama) and show token costs in the model pickers.
- Track token consumption and spend per session and surface in the performance overlay.
- Keep LLM input compact with summaries of recent events and decisions.

## Follow-up Tracking
- Ongoing token-reduction follow-up work is tracked in `specs/054-llm-token-reduction-tracker.md`.
- Use that tracker as the canonical implementation board for payload-size reduction, prompt dedupe, session-reset policy, compact strategic digest work, and remaining verification.

## Settings & Persistence
- Settings are persisted to localStorage under `rts_llm_settings`.
- Per-provider settings:
  - API key
  - Base URL
  - Selected model
- Strategic settings:
  - Enable toggle
  - Tick interval (seconds)
  - Provider selection
  - Verbosity (minimal/normal/full)
- Commentary settings:
  - Enable toggle
  - Provider selection
  - Prompt override
  - Read-aloud toggle (default enabled)
  - Voice selection (browser TTS voices)

## LLM Providers
- OpenAI: `GET /v1/models`, `POST /v1/chat/completions`
- Anthropic: `GET /v1/models`, `POST /v1/messages`
- xAI: `GET /v1/models`, `POST /v1/chat/completions`
- Ollama: `GET /api/tags`, `POST /api/chat`
- Temporary UI lock (2026-02-18): only OpenAI is selectable in game settings; other provider sections remain visible but collapsed with a "coming soon!" hint.

## Cost Tracking
- Costs fetched from local JSON only (`public/data/llm-costs.json`) because the remote source URL is currently unavailable.
- Usage tallies:
  - Total tokens + cost per session
  - Per provider/model breakdown
- Performance overlay shows LLM tokens and spend.

## Strategic Control Flow
- Every N seconds (default 30s) the strategic controller:
  - Exports `GameTickInput` for each AI player and derives a compact `inputMode: compact-strategic-v1` strategic digest from it.
  - Adds a compact summary of recent state and transitions.
  - On the first prompt per AI player, sends a full system brief with game overview + control schema.
  - On subsequent OpenAI prompts, reuses session context without resending the same instruction prompt on every tick; fresh instructions are resent only when bootstrapping or after an explicit response-chain reset.
  - Requests LLM output as `GameTickOutput`.
  - Applies actions via `applyGameTickOutput` with budget overrides.
  - Locks units touched by LLM commands to prevent local AI override.
- Local AI continues micro-management between ticks for units not under an LLM lock.
- OpenAI uses `/v1/responses` with `previous_response_id` and a simplified `json_schema` (protocolVersion, tick, actions, intent, confidence, notes all required) to satisfy provider-side strict validation; request shaping now avoids duplicating the same system/instruction prompt inside both `input` and `instructions`.
- Strategic requests now track estimated prompt size, log request metrics, apply a capped output-token budget, and reset the response chain when request-count or estimated-context budgets are exceeded.
- When a response chain resets, a compact carry-forward memory object is sent with trimmed prior context instead of relying on the provider to remember an unbounded history.
- The compact strategic digest replaces raw unit/building arrays in the prompt with grouped force summaries, condensed owned-building state, visible enemy intel, priority target ids, compact map/base intel, recent delta highlights, and queue state.

## Commentary Flow
- If enabled, a lightweight prompt generates short taunts and announcements.
- Speech synthesis reads commentary aloud when enabled.
- Commentary skips ticks where no interesting events occurred (no combat, production, or destruction events) to avoid spamming.
- When the LLM chooses to skip commentary it responds with `{"skip": true}` which is silently accepted.
- The last 10 commentary messages are tracked and included in the prompt to prevent repetition; the LLM is instructed to vary vocabulary and never repeat itself.
- Commentary prompt enforces strict owner-aware narration: the AI must treat `input.playerId` as its own side and use each entity's `owner` field to attribute losses/kills correctly across all parties.
- All commentary notifications are recorded in a persistent notification history log (up to 100 entries) accessible via a bell icon in the top-right corner.
- Commentary requests now use a much smaller output-token cap than strategic planning and participate in the same response-chain reset policy for OpenAI-backed sessions.
- Commentary still uses the generic snapshot path and remains the next major compaction target.

## Fog-of-War Awareness
- The LLM strategic AI only receives information about enemy units and buildings that are visible to its own forces.
- Visibility is computed on-the-fly per AI tick using the AI player's own units and buildings with appropriate vision ranges per unit type.
- If shadow-of-war is disabled in game settings, the full game state is passed without filtering.

## Unit/Building Catalogs in Bootstrap
- The initial strategic system prompt includes a full JSON catalog of all unit types with cost, HP, speed, armor, ammo capacity, damage, weapon type, fire range, spawn building, and tactical role.
- A full JSON catalog of all building types with cost, power consumption, HP, size, weapon stats, requirements, and tactical notes is also included.
- These catalogs give the LLM full knowledge of the game's economy and military capabilities on its first tick.

## Owner-Aware State Updates
- Game state snapshots sent to the LLM include an `owner` field on every unit and building.
- The `summarizeInput()` function provides owner-specific breakdowns (e.g., MyUnits/EnemyUnits/MyBuildings/EnemyBuildings counts).

## LLM-Locked Unit Behavior
- Units under LLM command lock (`llmOrderLockUntil`) still retaliate against attackers within 1.2× their fire range.
- LLM-locked units also auto-target the nearest enemy unit or building within fire range if they have no current target.
- LLM-locked units always have `allowedToAttack = true` so the combat system permits firing.
- After retaliation/auto-targeting, the LLM's strategic orders continue to be respected (units skip normal AI strategic decisions).
- The bootstrap prompt includes guidance on tactical retreat (pull back damaged units below 30% HP to repair buildings).

## AI Combat Unit Firing Permission
- All AI combat units (tanks, rocket tanks, howitzers, apaches) spawn with `allowedToAttack = true` set in `enemySpawner.js`.
- Non-combat support units (harvesters, ambulances, tanker trucks, recovery tanks, mine layers/sweepers, ammunition trucks) do not receive this flag.
- The group-attack strategy (`applyEnemyStrategies`) only overrides `allowedToAttack` when the unit has a valid target — when `unit.target` is `null`, `allowedToAttack` is preserved so units remain able to fire when they acquire a target later in the same frame.
- This prevents a timing issue where `shouldConductGroupAttack()` returned `false` for `null` targets, clearing the flag before target assignment occurred.

## Economy Awareness
- The bootstrap prompt includes a dedicated ECONOMY & MONEY SUPPLY section explaining the harvester + refinery income loop.
- The LLM is instructed to prioritize at least 1 harvester + 1 refinery before building military units.
- Emergency sell guidance is included for when the AI is low on funds.

## Tech Tree Enforcement
- The `applyGameTickOutput` applier enforces the tech tree for both `build_place` and `build_queue` actions at queue time.
- Actions requesting buildings/units that aren't unlocked yet are rejected with `TECH_TREE_LOCKED`.
- `computeAvailableBuildingTypes()` and `computeAvailableUnitTypes()` mirror the sync logic in `productionControllerTechTree.js`.
- Tech tree is re-checked at construction/production start time — if prerequisites were destroyed after queuing, the item is dropped and cost refunded.

## Sequential Construction & Production (Fair Play)
- LLM `build_place` actions are queued per AI player instead of placed instantly.
- Buildings are constructed one at a time using the same timer-based system as the local AI and human player.
- Construction duration formula: `750 * (cost / 500)` ms, modified by power deficit and game speed — identical to the local AI.
- If the LLM's requested tile position is blocked, the system falls back to `findBuildingPosition()` — the same algorithmic placement used by the local AI — to find a nearby valid spot.
- If no valid position can be found at all, the item is dropped from the queue and money is refunded.
- LLM `build_queue` (unit production) actions are similarly queued and produced one at a time with 10 000 ms base duration, matching the local AI.
- The queue processing runs every AI update frame within `updateAIPlayer()`.
- This ensures the LLM enemy AI follows the same rules as both the human player and the local AI — no simultaneous construction, no instant placement.

## Queue Completion Tracking & Duplicate Prevention
- Each queue item has a `status` field: `queued`, `building`, `completed`, or `failed`.
- When `processLlmBuildQueue` starts construction, the item is marked `building` (not removed from the queue).
- When construction finishes in `enemyAIPlayer.js`, the item is marked `completed` via `markLlmBuildComplete()`.
- Same flow applies to unit production via `markLlmUnitComplete()`.
- Failed items (tech tree locked, no valid position, no spawn factory) are marked `failed` with a `failReason`.
- The exporter includes the full LLM queue state (`snapshot.llmQueue`) so the LLM sees what's already queued, in-progress, or completed — preventing duplicate commands.
- The applier rejects `build_place` actions for building types that are already `queued` or `building` in the queue (`ALREADY_QUEUED` rejection reason).
- The bootstrap prompt instructs the LLM to check `snapshot.llmQueue` before issuing build/production commands.

## Immediate First Tick
- The LLM strategic AI fires its first tick immediately when the game starts, rather than waiting for the tick interval to elapse.
- This is achieved by checking `lastTickAt === 0` as a special case in the tick scheduler.
- Subsequent ticks follow the normal tick interval (default 30 seconds).

## Sell & Repair Actions
- The LLM can issue `sell_building` actions to sell a building for 70% of its cost. Selling the Construction Yard is blocked (`PROTECTED_BUILDING`).
- The LLM can issue `repair_building` actions to start repairing a damaged building at 30% of its repair cost.
- Both actions are defined in the JSON schema and documented in the bootstrap prompt.

## Base Defense Avoidance
- The bootstrap prompt includes tactical guidance to avoid enemy turret clusters.
- The LLM is advised to stage units outside turret range and only attack when it has 2-3× the firepower of detected defenses.

## Building Placement Proximity Rule
- The bootstrap prompt now includes a CRITICAL placement rule: new buildings MUST be placed within 3 tiles (Chebyshev distance) of an existing owned building.
- The LLM is instructed to look at its existing buildings in the snapshot and place new buildings within 1-2 tiles of them.
- Rejected and accepted actions from the applier are logged via `window.logger.warn` / `window.logger.info` for debugging.

## Per-Party LLM Control Toggle
- Each AI party has an `llmControlled` boolean on its `partyState` (defaults to `true` when LLM strategic is enabled).
- The multiplayer sidebar shows a toggle button (🤖 LLM / ⚙️ Local) for each AI party.
- Clicking the toggle switches between LLM strategic AI and local AI for that party.
- `getAiPlayers()` in the strategic controller filters out parties with `llmControlled === false`.

## UI Hooks
- Settings modal includes LLM sections and provider configuration.
- Selecting any enemy building (including factories like the Construction Yard) for a party currently assigned to LLM strategic control shows the LLM strategic plan tooltip including:
  - Strategic intent/notes from the LLM
  - Production plan (queued buildings and units with images and status indicators)
  - Status indicators: ✓ completed (green, strikethrough), ⏳ in-progress (yellow highlight), ✗ failed (red, dimmed), queued (no icon)
  - Commands (unit movement, attack, sell, repair actions)
- The production plan tooltip renders a scrollable, ordered list with unit/building names, images, and live queue status.
- The production plan shows latest/newest items at the top (reversed insertion order) so the most recent strategic decisions are immediately visible.
- The tooltip does not dismiss on `mouseleave` from the canvas when an enemy building is selected, preventing accidental hiding when the pointer enters the tooltip overlay.
- Legacy saves that still store `strategic.enabled: false` must still show the tooltip when the selected enemy party is marked `llmControlled: true`.

## API Key & Provider Management
- OpenAI API key entry now includes a security-critical disclosure panel that appears on hover/focus and explains required API scopes (`GET /v1/models`, `POST /v1/responses`), quota limiting, optional usage, and localStorage/XSS exposure risks.
- OpenAI key input is gated behind an explicit "enter at my own risk" acknowledgment checkbox persisted in settings (`providers.openai.riskAccepted`).
- The disclosure links to official OpenAI API key safety guidance and recommends low-cost models (for example nano-class variants).
- Providers that require an API key (OpenAI, Anthropic, xAI) will not attempt model fetches or LLM calls when no key is configured.
- Ollama runs locally and does not require an API key; the API key input is not shown in the settings UI.
- Model list refresh during settings panel initialization is silent (no error notifications); explicit refresh button clicks show error notifications normally.
