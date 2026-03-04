# 049 - InceptionLabs provider + multi-provider party LLM assignments

## Goal
Enable Mercury M2 (InceptionLabs) as a selectable LLM provider and let each AI party choose Local AI or a specific configured LLM model from a shared model pool.

## Requirements
1. Add **InceptionLabs** provider configuration to LLM settings (API key, base URL, model refresh) similar to OpenAI.
2. Keep request/response flow OpenAI-compatible for Mercury models; use fixed model listing and `v1/chat/completions` for calls until a public model-list endpoint exists.
3. Add a **model pool** UI at the top of the LLM strategic settings:
   - Select provider
   - Select model
   - Optional model-specific interval seconds
   - Add model to pool list
4. Show pool entries as `modelName (Ns)` where `N` is model-specific interval or fallback global strategic interval.
5. In multiplayer party rows, replace binary LLM toggle with a selector supporting:
   - `Local`
   - any configured model from model pool
6. Store per-party selection in party state (`llmControlled`, `llmModelKey`) so different parties can use different providers/models.
7. Strategic tick scheduling must honor model-specific interval when selected for a party.

## Validation
- E2E test covers:
  - adding at least two models from different providers into pool,
  - assigning a provider/model to one AI party,
  - switching same party back to local AI.

## Implementation update (2026-03-04 follow-up)
- InceptionLabs currently has no public model-list endpoint in this project context, so UI uses a fixed model option: **Mercury 2**.
- InceptionLabs requests are sent through **`/v1/chat/completions`** (OpenAI chat-compatible payload), while OpenAI remains on `/v1/responses`.
