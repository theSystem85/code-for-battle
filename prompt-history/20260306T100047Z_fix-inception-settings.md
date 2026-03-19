# 2026-03-06T10:00:47Z
LLM: codex

Prompt:
Fix follow-up issues from previous InceptionLabs PR:
1) API rejects display model `Mercury 2`; must send valid ids (e.g. `mercury-2`).
2) Remove global settings controls: strategic enable checkbox, strategic interval input, strategic provider select.
3) Commentary should choose a model from model pool and use that model interval independently.
4) Prevent multiplayer party model selector overflow and crop long labels.
