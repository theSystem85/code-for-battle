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
- [ ] Add request-size instrumentation and explicit request budgets.
- [ ] Reset or avoid unbounded `previous_response_id` chains.
- [ ] Replace the generic raw snapshot with a compact strategic digest.
- [ ] Rework commentary to use a compact event digest instead of the generic snapshot.
- [ ] Shrink the bootstrap/follow-up prompts substantially.
- [ ] Remove duplicate system/instruction prompt content from requests.
- [ ] Lower strategy/commentary output token caps.
- [ ] Add adaptive degradation when payload budgets are exceeded.

## Progress Board

### Phase 1 - Safety rails and observability
- [ ] Add serialized request size logging for strategic and commentary calls.
  - Target files: `src/ai/llmStrategicController.js`, `src/ai/llmProviders.js`
  - Done when: logs show request bytes/chars, provider/model, previous-response reuse, and provider token usage.
- [ ] Add hard request budgets before dispatch.
  - Done when: oversized requests are downgraded or skipped instead of being sent blindly.
- [ ] Add explicit output caps per request type.
  - Done when: strategy uses a much smaller cap than the current default and commentary uses a very small cap.

### Phase 2 - Prompt duplication and session growth
- [ ] Remove duplicate instruction payloads for OpenAI requests.
  - Current issue: the request path can send overlapping bootstrap/follow-up content via message content plus `instructions`.
  - Done when: each request has exactly one authoritative instruction source.
- [ ] Add `previous_response_id` reset policy.
  - Suggested policy: reset every N ticks or when cumulative prompt budget exceeds threshold.
  - Done when: long matches do not cause unbounded context accumulation.
- [ ] Persist only compact local memory across resets.
  - Minimum memory: current intent, unresolved goals, stale enemy intel summary, recent rejected-action reasons.

### Phase 3 - Compact strategic digest
- [ ] Add a new export path for compact strategic input instead of reusing the generic `GameTickInput` snapshot.
  - Suggested shape: `economy`, `baseStatus`, `forceGroups`, `supportStatus`, `knownEnemyIntel`, `mapIntel`, `queueState`, `recentDeltas`, `constraints`, `memory`.
  - Done when: strategic requests no longer send raw full unit/building arrays as the primary state representation.
- [ ] Replace per-unit combat state with grouped force summaries.
  - Keep per-unit detail only for harvesters, logistics/support units, unique aircraft, heavily damaged units, and units currently executing LLM plans.
- [ ] Replace raw map tile data with strategic map intel.
  - Include only ore control, expansion sites, chokepoints, lanes, and distance/approach summaries.

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
- [ ] Evolve the input contract explicitly rather than silently redefining the current snapshot.
  - Options: protocol version bump or explicit compact mode.
- [ ] Add unit coverage for budget resets, prompt dedupe, compact digest export, and degraded fallback behavior.
- [ ] Add a behavior-driven Playwright test that intercepts the provider request and asserts:
  - no duplicated system/instruction prompt payload,
  - no raw full-map dump,
  - compact strategic sections only,
  - serialized payload stays under the chosen ceiling.
- [ ] Update `specs/031-llm-control-api.md` and `specs/032-llm-strategic-ai.md` after the compact input contract is finalized.

## Immediate Next Slice
- [ ] Remove prompt duplication from the strategic and commentary request path.
- [ ] Add request-size/token instrumentation.
- [ ] Lower output token caps aggressively.
- [ ] Add `previous_response_id` reset policy.
- [ ] Add one request-interception E2E covering payload duplication and size budget.

## Agent Notes
- Treat this file as the canonical progress tracker for follow-up token-reduction work.
- When a task is implemented, update both the checkbox state and the nearest “Done when”/status note.
- If a change materially alters the input contract, update `specs/031-llm-control-api.md` and `specs/032-llm-strategic-ai.md` in the same task.
- If a task is intentionally deferred, add a short reason directly below the checklist item instead of removing it.