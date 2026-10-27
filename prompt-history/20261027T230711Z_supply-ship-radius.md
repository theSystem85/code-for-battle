# Supply ship radius

UTC timestamp: 20261027T230711Z
Model: GPT-6 (exact version and reasoning level unavailable)
Harness: Codex desktop

## User prompt

increase radius of supply ship by 33%.

## Change

Increase the supply service radius from 2 to 2.66 tiles and keep all fallback values aligned.

Servicing and AI now use continuous coordinate distances so the fractional radius takes effect. Added U07018 to cover ships just inside and outside the expanded radius for configured and fallback defaults. Lint, focused Chromium validation, and all 86 integration tests pass. The full unit suite has 5,678 passing tests; four subprocess permission failures pass on rerun with execution permissions. Existing E2E test E00106 fails to spawn its scenario units.
