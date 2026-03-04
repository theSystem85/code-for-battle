# 2026-03-03T00:35:00Z

- LLM: copilot
- Prompt summary: Ensure SSE map generation uses decorative land tiles with legacy likelihood, constrained by biome-specific tags, and never uses decorative biome tiles for normal biome land.

## Requested fixes
- Preserve decorative tile usage probability from legacy non-SSE land distribution.
- Restrict decorative tile selection to tiles tagged with both biome and `decorative`.
- Prevent decorative biome tiles from being used for normal passable land of that biome.
- Keep SSE scope only.
