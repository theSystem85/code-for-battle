UTC timestamp: 2026-04-26T15:02:45Z
LLM: codex

## Prompt

fix these remaining issues:

1) the generated major sprite sheet contains lots of redundancies in the image data (copied tiles). Ensure to not put ANY redundant tile in the major sprite sheet at all. for each tile store a hash of the image data and when adding new tiles to the sheet during its generation ensure this hash does not occur again.

2) ensure the major sprite sheet and its json is gitignored because it is generated on build time (document this accordingly)
