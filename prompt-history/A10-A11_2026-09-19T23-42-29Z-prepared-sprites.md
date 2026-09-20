# 2026-09-19T23:42:29Z

Model: Cursor Cloud Agent using GPT-5.6 Sol. Exact reasoning level, model version, and token counts are not available.

## Prompt

You are a Wave 2 lane worker for the Code for Battle repo. Implement ONLY steps A10 and A11 from rendering_improvement_todos.md in an isolated git worktree. Do not edit another lane's files or shared docs/TODO/package.json (C00/integration owner handles package/manifest registrations; if a generator script is required, add it under scripts/ as part of your exclusive new modules and report it). Prompt-history only if required: unique A10-A11 prefixed filename.

Read first:
- rendering_improvement_todos.md A10/A11
- specs/069-rendering-preparation-contracts.md
- src/rendering/prepared/preparedSpriteRegistry.js
- image renderers: tank, harvester, rocketTank, ambulance, tankerTruck, recoveryTank, ammunitionTruck, mineLayer, mineSweeper, howitzer, destroyer, supplyShip, navalFleet, turret, apache, f22, f35 under src/rendering/
- jetRenderScale.js only if needed for takeoff/landing exceptions
- existing matching *ImageRenderer tests

Exclusive write set:
- new sprite preparation/build modules
- generated assets under public/images/prepared/ ONLY (WebP 85% compression; do not add PNG/JPG)
- the listed *ImageRenderer.js files
- jetRenderScale.js only if necessary to enforce authorized takeoff/landing size exceptions
- matching image-renderer tests

MUST NOT edit buildingRenderer.js or unitRenderer.js (E10). Expose prepared building-layer LOOKUP helpers in your sprite registry/modules for E10 to consume later; do not edit E10 files.

A10:
- Inventory source dimensions, logical footprint, density, alpha, anchors and state variants.
- Build WebP-85 generator/manifest and runtime loader for prepared native-size variants; preserve source masters and exact layer anchors.
- Prepare custom art and nonstandard DPR before readiness; cache keys include asset version and density. Decoded byte/disposal accounting via PreparedSpriteRegistry.
- Complete-transform sizing audit must recognize truly native draws. Do not remove rotations or quantize headings. No unbounded heading/size Cartesian-product cache.

A11:
- Replace steady size conversion in owned image renderers with prepared layers; retain continuous rotation, mounting, recoil, muzzle flashes, clips and aspect ratios.
- Prepare Apache existing body buckets and fixed rotor dimensions before play; preserve rotor motion.
- Stable prepared aircraft ground/flight sizes; ONLY actual takeoff/landing may resize; tag those audit events explicitly. Aircraft exceptions must not cover ordinary ground/naval resizing.

New binary assets MUST be WebP quality 85. Prefer generating via sharp (already a dependency) rather than committing huge unnecessary duplicates; keep generated set bounded.

Hot-loop: no per-frame image resize/canvas variant construction. Prepared rendering policy.
Do NOT run 75 FPS benchmarks.

After implementation: npm run lint:fix:changed then npm run test:unit. Fix root causes.
Commit in the worktree.

Return: changed paths; remaining issues; validation commands/results; exact model name.
