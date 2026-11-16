# Fire visuals and severity

UTC: 2026-11-16
Harness: Codex. Model family: GPT-6. Exact model version, reasoning setting, token totals and task duration are not exposed by the runtime.

User request:
Make the visuals for the fire animation more stunning and realistically looking while still being very performant! Keep the current animation as a low detail variant and the new version as high detail to be configurable in graphics setting (dropdown). Make sure the new animation uses transparency levels and merges adjacent tiles into one seamless animation. Respect wind direction, use webgpu support and sparks and some smoke as well. Each burning tile has up to five different levels of severity that influence the animation size, height, smoke, the damage and the time to be extinguished, the likelihood of spreading to next tiles. Compare what is better to use a) a generative simulation to render the fire or b) a sprite sheet based animation (like final explosion animation that is already used). If you choose option b) then ensure to also create that sprite sheet and have the format compatible with the explosion animation.

For the existing low detail fire animation also add some transparency to it.

Ensure the apache rockets can also cause fire.
