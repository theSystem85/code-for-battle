# 2026-03-03T00:20:00Z

- LLM: copilot
- Prompt summary: SSE-only follow-up to fix immediate biome remap behavior for land tiles, add default `rocks` tag, and enforce legacy fallback when required SSE type tags are missing.

## Requested fixes
- Biome changes should immediately affect integrated land tile rendering.
- Land should use selected biome-tagged SSE tiles (not random generic buckets).
- Add `rocks` to default SSE tags and map rock tiles via SSE when available.
- If required type tags are missing (`land/street/water/rock`), fall back to legacy non-SSE rendering.
- Keep scope limited to SSE.
