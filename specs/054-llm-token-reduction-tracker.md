# 054 - LLM Token Reduction Follow-up Tracker

## Context
- Date: 2026-03-21
- Prompt Source: follow-up implementation planning after reviewing PR 554 payload behavior
- LLM: GitHub Copilot (GPT-5.4)
- Canonical design refs: `specs/031-llm-control-api.md`, `specs/032-llm-strategic-ai.md`

## Goal
Reduce strategic and commentary LLM request size enough that steady-state calls stay comfortably below model context limits, remove avoidable prompt duplication, and make progress easy for different agents to continue without re-discovery.

## Current State Summary

### Already implemented
- [x] Remove redundant unit world-pixel `position` from exported snapshots.
- [x] Omit null/default `status`, `orders`, and `rallyPoint` fields where possible.
- [x] Aggregate damage transition events by target.
- [x] Update example payloads and unit coverage for the above exporter compaction.
- [x] Record the initial token-reduction task in `TODO/Improvements.md` and prompt history.

### Confirmed gaps after PR 554 review
- [x] Add request-size instrumentation and explicit request budgets.
- [x] Reset or avoid unbounded `previous_response_id` chains.
- [x] Replace the generic raw snapshot with a compact strategic digest.
- [x] Rework commentary to use a compact event digest instead of the generic snapshot.
- [x] Shrink the bootstrap/follow-up prompts substantially.
- [x] Remove duplicate system/instruction prompt content from requests.
- [x] Lower strategy/commentary output token caps.
- [x] Add adaptive degradation when payload budgets are exceeded.

## Progress Board

### Phase 1 - Safety rails and observability
- [x] Add serialized request size logging for strategic and commentary calls.
  - Target files: `src/ai/llmStrategicController.js`, `src/ai/llmProviders.js`
  - Status: implemented request logging in `src/ai/llmProviders.js` plus usage logging in `src/ai/llmStrategicController.js` for strategic/commentary requests.
- [x] Add hard request budgets before dispatch.
  - Status: implemented estimated prompt-token budgets, chain resets, and oversized-request skipping for strategic/commentary calls.
- [x] Add explicit output caps per request type.
  - Status: strategic requests now use a capped output budget and commentary uses a much smaller cap than the old default.

### Phase 2 - Prompt duplication and session growth
- [x] Remove duplicate instruction payloads for OpenAI requests.
  - Current issue: the request path can send overlapping bootstrap/follow-up content via message content plus `instructions`.
  - Status: OpenAI now sends one authoritative instruction source and no longer duplicates system prompt content inside the input payload.
- [x] Add `previous_response_id` reset policy.
  - Suggested policy: reset every N ticks or when cumulative prompt budget exceeds threshold.
  - Status: chain resets now trigger on request-count and estimated-context budgets.
- [x] Persist only compact local memory across resets.
  - Minimum memory: current intent, unresolved goals, stale enemy intel summary, recent rejected-action reasons.
  - Status: resets now carry forward compact plan intent/notes/confidence, trimmed summary, and recent rejection reasons.

### Phase 3 - Compact strategic digest
- [x] Add a new export path for compact strategic input instead of reusing the generic `GameTickInput` snapshot.
  - Suggested shape: `economy`, `baseStatus`, `forceGroups`, `supportStatus`, `knownEnemyIntel`, `mapIntel`, `queueState`, `recentDeltas`, `constraints`, `memory`.
  - Status: implemented `buildCompactStrategicInput()` in `src/ai/llmStrategicDigest.js` and switched strategic request messages to send the compact digest rather than raw `snapshot.units` / `snapshot.buildings` arrays.
- [x] Replace per-unit combat state with grouped force summaries.
  - Keep per-unit detail only for harvesters, logistics/support units, unique aircraft, heavily damaged units, and units currently executing LLM plans.
  - Status: combat/support/logistics/aircraft units now ship as grouped force summaries with full `unitIds`, while only strategically important units retain per-unit detail.
- [x] Replace raw map tile data with strategic map intel.
  - Include only ore control, expansion sites, chokepoints, lanes, and distance/approach summaries.
  - Status: strategic requests now send compact map/base intel (map size, fog state, base centers, visible refineries) instead of any raw map tile dump.

### Phase 4 - Strategic delta redesign
- [x] Keep only strategy-relevant transitions.
  - Keep: created/destroyed, construction started/completed/failed, large damage spikes, sighting changes, base-under-attack changes, economy threshold crossings, expansion changes, frontline shifts.
  - Drop or aggregate: noisy movement chatter and repetitive micro-events.
- [x] Send deltas only since the last successful LLM tick.
  - Done when: retries or skipped ticks do not replay large stale event windows.
  - Status: strategic requests now rank/filter transition highlights down to strategy-relevant events and track each AI player's last successful strategic tick so retries do not resend stale windows.

### Phase 5 - Prompt slimming
- [x] Replace the huge bootstrap prompt with a concise invariant ruleset.
  - Status: the strategic bootstrap prompt now focuses on core rules, economy priorities, ownership, and tactical constraints instead of re-explaining the full game catalog.
- [x] Remove full static unit/building catalogs from the bootstrap.
  - Status: removed the embedded static unit/building catalog blobs from `src/ai/llmStrategicController.js`.
- [x] Send currently available build/unit options inside the compact input instead.
  - Status: `buildCompactStrategicInput()` now includes `productionOptions.availableBuildings` and `productionOptions.availableUnits` derived from the live tech tree.
- [x] Keep structured output schema strict, but stop duplicating protocol explanation in prompt prose.
  - Status: the response schema remains strict while the prose prompt is reduced to the minimum behavioral rules needed for planning.

### Phase 6 - Commentary compaction
- [x] Build a dedicated commentary input path.
  - Input should contain only: interesting recent deltas, owner context, anti-repeat memory, and a short summary.
  - Status: implemented `buildCompactCommentaryInput()` in `src/ai/llmCommentaryDigest.js` with owner context, compact recent-delta highlights, and anti-repeat memory.
- [x] Stop exporting the generic game snapshot for commentary.
  - Status: commentary prompts now send `inputMode: compact-commentary-v1` instead of the raw `GameTickInput` snapshot.
- [x] Give commentary its own tight budget and degradation rules.
  - Status: commentary now degrades its compact payload by trimming highlight/comment history before skipping, while still honoring the existing commentary-specific token cap.

### Phase 7 - Adaptive degradation and safeguards
- [x] Degrade oversized requests in a fixed order.
  - Suggested order: drop map-intel detail, collapse force groups harder, shorten delta window, trim stale enemy intel, reset provider session.
- [x] Skip the LLM tick if the request still exceeds budget after degradation.
  - Done when: the engine preserves the last valid plan rather than sending an oversized request.
  - Status: strategic requests now try progressively smaller compact-input variants before skipping, matching the commentary path's degrade-then-skip behavior.

### Phase 8 - Protocol, tests, and docs
- [x] Evolve the input contract explicitly rather than silently redefining the current snapshot.
  - Options: protocol version bump or explicit compact mode.
  - Status: strategic requests now declare `inputMode: compact-strategic-v1` and the design docs have been updated to describe the compact strategic contract explicitly.
- [x] Add unit coverage for budget resets, prompt dedupe, compact digest export, and degraded fallback behavior.
  - Status: added focused unit coverage for both strategic and commentary compact digest builders, plus request-budget/provider behaviors.
- [ ] Add a behavior-driven Playwright test that intercepts the provider request and asserts:
  - no duplicated system/instruction prompt payload,
  - no raw full-map dump,
  - compact strategic sections only,
  - serialized payload stays under the chosen ceiling.
- [x] Update `specs/031-llm-control-api.md` and `specs/032-llm-strategic-ai.md` after the compact input contract is finalized.
  - Status: both specs now document the compact strategic/commentary contracts, strategic delta filtering, degrade-then-skip behavior, and the economy-first enforcement layer.

## Immediate Next Slice
- [x] Remove prompt duplication from the strategic and commentary request path.
- [x] Add request-size/token instrumentation.
- [x] Lower output token caps aggressively.
- [x] Add `previous_response_id` reset policy.
- [ ] Add one request-interception E2E covering payload duplication and size budget.

## Implementation Notes - 2026-03-21
- Added `src/ai/llmRequestBudget.js` with budget constants, prompt-token estimation, summary trimming, carry-forward memory helpers, and chain-reset decisions.
- Strategic OpenAI follow-up requests now avoid resending prompt instructions on every continued chain request; instructions are resent only on fresh sessions or reset boundaries.
- Commentary requests now use the same reset-and-cap discipline with a much smaller output ceiling.
- Added `src/ai/llmStrategicDigest.js` and switched strategic requests to a compact `inputMode: compact-strategic-v1` payload with grouped forces, condensed building state, enemy priority targets, compact map intel, and compact recent deltas.
- Added `src/ai/llmCommentaryDigest.js` and switched commentary requests to a compact `inputMode: compact-commentary-v1` payload with owner-aware highlights, anti-repeat memory, and commentary-specific degradation.
- Commentary now uses the first active AI player as its perspective and filters for the actual transition types emitted by the collector (`damage`, `destroyed`, `building_completed`, etc.).
- Added shared `src/ai-api/techTree.js` helpers so the compact strategic input can expose only the current live production options; the large static strategic catalogs are gone from the bootstrap prompt.
- Strategic requests now degrade through smaller compact-input variants before skipping; remaining follow-up work is mainly the optional request-interception E2E coverage.
- Added `src/ai/llmStrategicPolicy.js` so unstable AI economies keep the next required powerPlant -> oreRefinery -> vehicleFactory -> harvester step ahead of non-economy spending even when the model drifts.
- Strategic planning now tops up a forward build backlog instead of only forcing the next economy step, so short construction/production queues are replenished several actions ahead on each tick.
- Commentary is now explicitly host-focused, commentary TTS uses a more robust speech-synthesis path, and when commentary and strategy use the same provider/model for the first AI player the commentary is generated inside the strategic request instead of issuing a second LLM call.

## Agent Notes
- Treat this file as the canonical progress tracker for follow-up token-reduction work.
- When a task is implemented, update both the checkbox state and the nearest “Done when”/status note.
- If a change materially alters the input contract, update `specs/031-llm-control-api.md` and `specs/032-llm-strategic-ai.md` in the same task.
- If a task is intentionally deferred, add a short reason directly below the checklist item instead of removing it.