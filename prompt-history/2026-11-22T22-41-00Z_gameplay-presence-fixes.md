# 2026-11-22T22:41:00Z

Processed by Codex using GPT-6. The exact model variant and reasoning level were unavailable.

Some issues to fix and improvements to make:

1. Prevent the sound effect from looping while an ammunition truck is serving.
2. Prevent units in guard mode from attacking streets built by enemies. Streets should be ignored.
3. Remove smoke from the Command Center.
4. Ensure all parties can use streets built by other parties. Pathfinding currently excludes foreign streets.
5. Too many requests to https://dev--code-for-battle.netlify.app/api/presence return 429. Use an increasing retry delay.
