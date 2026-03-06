UTC: 2026-03-06T12:56:20Z
LLM: codex (GPT-5.2-Codex)

Prompt content:
Goal:
Integrate high-quality seamless animated water using shader/world-space animation instead of frame-based tile animation.

Put uploaded image assets here to be used:
- public/images/map/water/water_base_seamless_512.webp
- public/images/map/water/water_normal_seamless_512.png
- public/images/map/water/water_noise_seamless_512.webp
- public/images/map/water/shore_foam_texture_seamless_512.png

Important requirements:
1. Water must look continuous across all tile borders
2. Animation must be based on world-space coordinates, never per-tile local animation
3. Keep the internal map logic tile-based, but render water visually as one continuous animated surface
4. Shore foam must appear only where water touches non-water terrain
5. The implementation must be deterministic and stable for multiplayer rendering
6. Keep performance good enough for an RTS with large maps
7. Do not introduce obvious repetitive artifacts if avoidable
8. Write clean, modular code and document it

Implementation target and build sections A-J provided by user, including fallback mode, debug tools, docs with Mermaid diagrams, and acceptance criteria.
