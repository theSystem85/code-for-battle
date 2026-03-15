# Feature Specification: GPU Terrain and Sprite Rendering

**Feature Branch**: `014-webgl-rendering-upgrade`
**Created**: 2025-11-21
**Status**: Proposed
**Input**: "Move terrain and sprite rendering to WebGL/WebGPU. The engine currently binds both the main and minimap canvases to the CPU-bound 2D context, which limits batching and GPU utilization. Replacing the main canvas context with WebGL (or WebGPU where available) would allow you to stream a single tile atlas to the GPU and render the map with instanced quads, drastically reducing per-tile CPU draw calls. Sprites (units, effects, overlays) can share the same pipeline through texture atlases and instanced vertex data."

---

## Overview

Upgrade the rendering stack to prioritize GPU-backed pipelines for the main playfield and minimap. Prefer WebGL2 when available and gracefully fall back to WebGL (or 2D) when GPU contexts are not accessible. Use shared atlases for tiles and sprites so draw work can be submitted with instancing rather than thousands of individual CPU draw calls.

---

## Requirements

1. **GPU Context Preference**
   - Attempt to bind the main canvas to WebGL2 first, then WebGL, with a transparent fallback path to existing 2D rendering if GPU contexts are unavailable.
   - Keep the input-handling canvas interactive even when the base layer is rendered via GPU.
2. **Tile Atlas Streaming**
   - Upload the existing tile atlas (and future sprite atlases) once per load and reuse it for draws; avoid per-frame uploads.
   - Represent tiles as instanced quads with per-instance UV rectangles and color fallbacks for missing atlas entries.
3. **Sprite Batching Path**
   - Define a sprite batching interface that can ingest unit, effect, and overlay quads with atlas UVs and per-instance transforms/rotations.
   - Allow the sprite path to share the same shader/program pipeline as the tile renderer when compatible.
4. **Visibility and Overlays**
   - Preserve fog-of-war/visibility overlays and UI layers by compositing on top of GPU-rendered layers; ensure z-order matches the current experience.
5. **Minimap Compatibility**
   - Provide a GPU rendering path for the minimap where available, with a 2D fallback; reuse atlas data to avoid duplicate loads.
6. **Performance Goals**
   - Reduce per-frame CPU draw overhead for terrain to a single instanced draw per frame (per layer) and eliminate redundant state changes.
   - Keep GPU submission resilient to changing map sizes and visibility windows without reallocating buffers each frame.
7. **Viewport Coverage**
   - Draw a buffer of off-screen tiles beyond the visible viewport (accounting for device pixel ratios) so no gaps or black bars appear when panning to any map edge.
8. **Animated Water Without Tile Asset Frames**
   - Render water procedurally in the GPU path (shader-driven animation) while still using logical `water` map tiles to determine placement.
   - Do not depend on water image-frame assets for base water rendering.
   - Expose the procedural water zoom as a numeric config value so the pattern scale can be tuned without shader rewrites.
   - Default the procedural water zoom farther out than the original implementation so the animation reads as a larger continuous body of water.
   - Keep procedural water pattern anchored in world space so camera scrolling does not introduce parallax drift.
   - Apply the same procedural water style to water SOT overlays for visual consistency, including aligned tile bounds so SOT corners do not appear broken relative to adjacent water tiles and GPU water SOT corners use the same animated shader treatment as full water tiles.
   - Favor crisp shoreline transitions over soft blur if blending artifacts appear.
   - Expose a persisted graphics setting that lets the player switch between procedural water and the legacy animated tile-water renderer from the in-game settings modal.
   - Expose persisted tone and saturation controls for the procedural water palette in both the settings modal and the runtime config under a dedicated Graphics category.
   - Default the procedural water palette controls to +35% tone and 40% saturation for the shipped experience.

---

## Notes

- WebGPU adoption is optional but the abstraction should leave room for a future adapter.
- Texture atlases should remain source-of-truth for both tiles and sprite layers to simplify batching and asset management.

---

## WebGPU Transition Plan (Chrome + Safari Alignment)

### 1) Support Baseline + Compatibility Matrix
- Target the current W3C WebGPU spec and confirm the minimum feature set for Chrome and Safari (adapter limits, required texture formats, sampler/filtering support, storage buffers, and render pass limits).
- Maintain a compatibility matrix that lists required core features vs. optional ones (timestamp queries, depth formats, texture compression) and maps them per browser so renderers can feature-gate safely.

### 2) Renderer Abstraction + Selection Strategy
- Introduce a renderer interface that normalizes WebGL2/WebGPU operations (pipeline creation, buffer/texture uploads, draw calls, and resource lifecycle).
- Establish an explicit renderer selection pipeline:
  1. **User preference** (settings flag): `WebGPU (preferred)` / `WebGL2` / `Auto` / `2D fallback`.
  2. **Auto** chooses WebGPU if `navigator.gpu` is available and device initialization succeeds, else WebGL2 → WebGL → 2D.
  3. **Hard fallback** triggers on initialization errors or `device.lost` events, with a visible banner/toast that the renderer switched.
- Persist the selection in localStorage and expose it in the settings menu with a short description of tradeoffs and a “Restart required” note if needed.

### 3) WebGPU Core Pipeline (Phase 0 Parity)
- Implement WebGPU device/queue initialization, swap chain configuration, and a render loop aligned with existing phases (terrain → sprites → overlays → UI).
- Establish shared WGSL shaders for tile/sprite instancing with configurable per-instance layouts that mirror WebGL attribute layouts.
- Define a renderer capability descriptor used by both pipelines to decide supported overlays, batching limits, and shader feature toggles.

### 4) Asset & Buffer Migration
- Move atlas upload to WebGPU textures and use staging buffers for initial load plus incremental updates.
- Define a single instance buffer layout for tiles, units, effects, and overlays to reduce per-frame buffer churn and keep parity with WebGL buffer packing.
- Build a shared atlas manager abstraction so WebGL and WebGPU share the same atlas metadata, UV packing rules, and invalidation flow.

### 5) Feature Parity Checklist + Validation
- Mirror WebGL features: animated water tiles, fog-of-war overlays, shadow-of-war masks, SOT overlays, and minimap rendering.
- Implement visual parity checks (screenshot diffing) for WebGL vs. WebGPU across a fixed set of maps/scenarios and record deltas.
- Add a debug overlay showing current renderer, adapter name, and key buffer stats to speed up parity verification.

### 6) Settings + Fallback UX
- Add a **Renderer** option in the settings menu:
  - `Auto (WebGPU if supported)`, `WebGPU (force)`, `WebGL2`, `WebGL`, `2D`.
- If WebGPU is forced but fails to initialize, display a non-blocking notification and auto-fallback to WebGL2.
- Provide a runtime toggle only if safe to hot-swap; otherwise prompt the user to restart the game session to apply changes.

### 7) Error Handling + Telemetry
- Use `navigator.gpu` checks, adapter request failures, and `device.lost` handling to fall back to WebGL2 or 2D without breaking gameplay.
- Log renderer selection, fallback reasons, and device lost events with an in-game debug panel (and optional console logging) to guide future optimization.

### 8) Performance Milestones + Rollout
- Measure CPU time per frame, draw call count, and GPU timings (when available) for WebGL2 vs. WebGPU.
- Track a target reduction in CPU draw overhead and stabilize frame time variance before defaulting to WebGPU.
- Rollout plan:
  1. **Phase 0**: WebGPU behind settings toggle (opt-in).
  2. **Phase 1**: WebGPU in Auto for supported devices, still user-overridable.
  3. **Phase 2**: WebGPU default with WebGL fallback preserved for compatibility.
