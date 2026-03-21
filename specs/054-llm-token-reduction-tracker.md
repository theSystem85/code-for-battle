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
- [ ] Rework commentary to use a compact event digest instead of the generic snapshot.
- [ ] Shrink the bootstrap/follow-up prompts substantially.
- [x] Remove duplicate system/instruction prompt content from requests.
- [x] Lower strategy/commentary output token caps.
- [ ] Add adaptive degradation when payload budgets are exceeded.

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
- [ ] Keep only strategy-relevant transitions.
  - Keep: created/destroyed, construction started/completed/failed, large damage spikes, sighting changes, base-under-attack changes, economy threshold crossings, expansion changes, frontline shifts.
  - Drop or aggregate: noisy movement chatter and repetitive micro-events.
- [ ] Send deltas only since the last successful LLM tick.
  - Done when: retries or skipped ticks do not replay large stale event windows.

### Phase 5 - Prompt slimming
- [ ] Replace the huge bootstrap prompt with a concise invariant ruleset.
- [ ] Remove full static unit/building catalogs from the bootstrap.
- [ ] Send currently available build/unit options inside the compact input instead.
- [ ] Keep structured output schema strict, but stop duplicating protocol explanation in prompt prose.

### Phase 6 - Commentary compaction
- [ ] Build a dedicated commentary input path.
  - Input should contain only: interesting recent deltas, owner context, anti-repeat memory, and a short summary.
- [ ] Stop exporting the generic game snapshot for commentary.
- [ ] Give commentary its own tight budget and degradation rules.

### Phase 7 - Adaptive degradation and safeguards
- [ ] Degrade oversized requests in a fixed order.
  - Suggested order: drop map-intel detail, collapse force groups harder, shorten delta window, trim stale enemy intel, reset provider session.
- [ ] Skip the LLM tick if the request still exceeds budget after degradation.
  - Done when: the engine preserves the last valid plan rather than sending an oversized request.

### Phase 8 - Protocol, tests, and docs
- [x] Evolve the input contract explicitly rather than silently redefining the current snapshot.
  - Options: protocol version bump or explicit compact mode.
  - Status: strategic requests now declare `inputMode: compact-strategic-v1` and the design docs have been updated to describe the compact strategic contract explicitly.
- [ ] Add unit coverage for budget resets, prompt dedupe, compact digest export, and degraded fallback behavior.
- [ ] Add a behavior-driven Playwright test that intercepts the provider request and asserts:
  - no duplicated system/instruction prompt payload,
  - no raw full-map dump,
  - compact strategic sections only,
  - serialized payload stays under the chosen ceiling.
- [ ] Update `specs/031-llm-control-api.md` and `specs/032-llm-strategic-ai.md` after the compact input contract is finalized.

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
- This branch still needs commentary compaction, prompt slimming, and adaptive degradation; the biggest raw strategic snapshot bloat has now been removed, but commentary still uses the generic snapshot path.

## Agent Notes
- Treat this file as the canonical progress tracker for follow-up token-reduction work.
- When a task is implemented, update both the checkbox state and the nearest “Done when”/status note.
- If a change materially alters the input contract, update `specs/031-llm-control-api.md` and `specs/032-llm-strategic-ai.md` in the same task.
- If a task is intentionally deferred, add a short reason directly below the checklist item instead of removing it.