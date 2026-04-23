UTC: 2026-04-23T11-32-44Z
LLM: codex (GPT-5.3-Codex)

## Prompt
Change generator auto-tags to directional tags per tile bit instead of one combined tag:
- use tags like `mask_t0`, `mask_r0`, `mask_b0`, `mask_l0` etc.
- do not use combined token format like `mask_t0_r0_b0_l0`.
