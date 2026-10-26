# Worker-backed tank rotations

## Improvement

- [x] **Remove background tank rotation contention** — prepare the existing 64-angle layered tank frames in an off-main-thread worker, reserve retained and temporary bytes before staging, atomically publish complete variants, and explicitly release unpublished or superseded resources.
  - Spec: [Sprite streaming performance analysis](../../specs/138-sprite-streaming-performance-analysis.md)

## Implementation choice

A runtime worker was chosen over bundled packed atlases. Packing every density would add generated transfer and storage for all 768 frames to the deployment and offline surface, while runtime preparation transfers only the complete variants present at the selected density. The worker preserves the current 64 angles and 2× supersampling, reuses one temporary supersampling surface per part, and transfers final `ImageBitmap` frames. The main thread therefore pays source cloning, message publication, and eventual upload costs, but no rotation/resampling slices. The reservation counts retained RGBA bytes plus the peak target-and-supersampling working set separately and rejects work above 32 MiB.

Hardware GPU validation of upload cost, native residency, and the 75 FPS acceptance gate remains pending on qualifying hardware, as required by `AGENTS.md`.
