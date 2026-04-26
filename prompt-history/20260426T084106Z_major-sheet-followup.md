# UTC Timestamp
2026-04-26T08:41:06Z

# LLM
GPT-5.3-Codex

# Prompt
The user was unsatisfied with the previous PR and requested follow-up fixes:
1) Replace overly bloated major sprite sheet JSON with a compact, runtime-performant format.
2) Ensure only the major sprite sheet is loaded at startup unless Custom sprite sheets is enabled or SSE is opened, and SSE loads only selected sheet on demand.
3) Preserve grouped-tag multi-tile assets consecutively in the major atlas and bucket rows by asset size (1x1 first, then size-2 blocks, then size-3, etc.).
4) Evaluate whether splitting transparent map assets into a separate major sprite sheet would improve performance/memory; implement only if beneficial and explain reasoning.
