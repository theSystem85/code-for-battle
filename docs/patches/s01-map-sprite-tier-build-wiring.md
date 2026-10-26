# S01 integration patch: prepared map sprite tier build

The integration owner should apply the following wiring after the independent lanes land. S01 intentionally does not edit the reserved package, Vite, Netlify, runtime registry, or offline-manifest paths.

1. Add `"build:map-sprite-tiers": "node scripts/build-map-sprite-tiers.mjs"` and `"check:map-sprite-tiers": "node scripts/build-map-sprite-tiers.mjs --check"` to `package.json`.
2. Run the check in the normal production build before Vite so missing, extra, or stale derivatives fail the build.
3. Teach the integrated sheet preparation path to load `public/images/prepared-map-sprites/catalog.json`, then load only a demanded sheet manifest and tier page. Do not eagerly fetch every page.
4. Use each manifest's immutable `metadataSignature`/`signature`, stable `spriteId`, logical geometry, anchor, and per-tier source rectangle instead of rebuilding metadata signatures per tile reference.
5. Once publication uses the generated alpha-ready page for a bundled sheet, bypass runtime full-sheet readback, black keying, and decoration cutout for that sheet.
6. Register the catalog/manifests as core offline metadata, but leave tier pages demand-driven rather than adding every page to the eager or bulk offline inventory.

The generated catalog includes 0.5× coarse and 1× final tiers. The 2× and 3× candidates are explicitly recorded as omitted because the bundled masters are 1×; generating those candidates would only manufacture pixels without detail.
