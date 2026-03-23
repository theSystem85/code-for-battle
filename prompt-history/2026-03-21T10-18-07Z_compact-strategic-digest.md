# 2026-03-21T10:18:07Z
**LLM: GitHub Copilot (GPT-5.4)**

## Prompt Summary
Continue with the next steps from spec 054, but do not add any new E2E tests.

## Changes Made
- Added `src/ai/llmStrategicDigest.js` to derive a compact `inputMode: compact-strategic-v1` payload for strategic LLM calls.
- Switched `src/ai/llmStrategicController.js` to send the compact strategic digest instead of the raw strategic snapshot, and updated the strategic prompt text to describe the new input contract.
- Added focused unit tests in `tests/unit/llmStrategicDigest.test.js` to verify grouped force summaries, preserved actionable ids, enemy priority targets, queue state, delta summaries, and payload-size reduction.
- Updated `specs/054-llm-token-reduction-tracker.md`, `specs/031-llm-control-api.md`, `specs/032-llm-strategic-ai.md`, and `TODO/Improvements.md` to reflect the compact strategic digest slice.
- No E2E test was added in this task per prompt instruction; commentary compaction remains pending.