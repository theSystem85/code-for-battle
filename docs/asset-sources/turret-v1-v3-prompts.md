# Turret V1–V3 image provenance

Generated with the connected OpenAI diffusion image-generation tool, using the three existing
`public/images/sidebar/turret_gun_v{1,2,3}.webp` images as visual references.
Requested model: OpenAI Image 2.5. The tool does not expose a model selector or a verifiable
backend model identifier; the exact model version cannot be certified from its response.

Read the building asset template in the root `skills.md`: realistic PBR, reinforced concrete
and steel, natural daylight, consistent geometry/materials with the build button, alpha
background, and overhead orthographic map art. Existing footprint is 1×1 (32 logical game
pixels); the template's older 64-pixel tile guidance is image-coordinate space, not game scale.
Keep the existing sidebar images. Barrels face south before continuous programmatic rotation.

## Generation prompt

Create a transparent regular three-column, three-row component atlas. Rows correspond to
V1 (rounded single-gun steel cupola), V2 (twin-gun armored cupola), V3 (angular pale-steel
three-gun housing), closely matching the sidebar references. Columns contain the stationary
circular foundation, rotating housing with recessed gun mounting points, and one separate
south-facing barrel. Each component must fit inside its cell with transparent gutters.
Use perfect vertical top-down orthographic camera, photorealistic PBR materials, crisp panel
seams and readable contrast, neutral daylight, subtle ambient occlusion, no ground, terrain,
checkerboard, text, grid, or shadow plane. Barrels must remain separate for independent recoil.

## Corrective edit

Remove all barrels, protruding gun tubes, and muzzle openings from the middle column;
leave only the armor housing. Keep all standalone barrels in column three. Correct the
camera toward vertical orthographic top-down, preserve transparent alpha and sharp material
contrast. The first generation included unwanted integrated guns and was not shipped.

The accepted generated atlas is `turret-v1-v3-components.webp` (WebP quality 85).
`node docs/asset-sources/turret-build-assets.mjs` extracts, centers and normalizes components
into 256×256 foundation/housing sources and 16×88 barrel sources (all WebP quality 85).
`npm run make:prepared-sprites` builds final-size DPR 1/2/3 variants before gameplay.
Gun mounts and muzzle coordinates use a fixed 64×64 coordinate frame in
`src/turretImageConfig.json`, independently of source density.
