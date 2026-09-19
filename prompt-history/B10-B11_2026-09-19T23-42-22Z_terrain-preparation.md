# B10/B11 terrain preparation

UTC timestamp: 2026-09-19T23:42:22Z

Model: Cursor Cloud Agent using GPT-5.6 Sol

Token counts, reasoning level, and exact task duration are unavailable and therefore omitted.

## Prompt

You are a Wave 2 lane worker for the Code for Battle repo. Implement ONLY steps B10 and B11 from rendering_improvement_todos.md in an isolated git worktree. Do not edit another lane's files or shared docs/TODO/package.json. Prompt-history only if required: unique B10-B11 prefixed filename.

Read the B10/B11 checklist, rendering preparation contracts, Wave 2 ownership spec, prepared-map and byte-budget contracts, organic/cliff terrain readiness, texture manager, and focused tests.

Within the exclusive B10/B11 write set, implement:

- Decode-complete atomic readiness for required terrain/biome/cliff art and applicable prepared variants.
- Prepare/cancel/dispose/progress and fail/retry lifecycle using AbortSignal and PreparationGeneration.
- Separate decoded-source, prepared-raster, transfer, and GPU-staging byte accounting.
- Per-generation SOT/biome/cliff descriptors and intended-density masks/composites, with old-generation disposal.
- Budget-gated all-resident raster selection and retained descriptors for large maps, including the 200×200 DPR-2 constraint.
- No worker assumption without measurement, no baked animated water, and no first-scroll static generation/source resizing.

Do not edit renderer/orchestrator/GPU/image-renderer integration files and do not run 75 FPS benchmarks. Run changed-file lint and all unit tests, fix root causes, commit in the worktree, and return changed paths, remaining issues, validation results, and exact model.
