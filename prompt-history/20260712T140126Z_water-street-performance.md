# 2026-07-12T14:01:26Z

**Model:** Codex

There is a huge performance problem that only kicks in when procedural water rendering is on and only on the iPhone physical device. It may require procedural water rendered with SOT and nearby street tiles. Deeply analyze the relevant rendering code, compare it with the known-performant `revet-to-642` branch and recent prompt history, fix the regression, and capture before/after screenshots of a map containing streets and water to ensure the optimized pipeline preserves the validated rendering.
