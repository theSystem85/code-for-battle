# City density tiers and calibrated village buildings

## Asset catalog

Add six default WebP q85/JSON pairs: `dtv5_city_{temperate,sand,snow}_{low,medium}`. Each has a new transparent 20-building source under `sources/cities_{biome}_{level}.webp`. Temperate matches grass and soil; sand and snow are distinct, with `winter` on all snowy cells. Preserve the original source images. Use SSE's actual alpha detector (cutoff 16, gap 0, min area 1000) and reject extraction counts other than 20. The shared source layout is four columns by five rows, classified by inspected source row and architectural appearance.

Density is an architectural score, independent of pixel dimensions and ground rectangle. Exactly one `density_1` through `density_10` tag belongs to every cell of a building group, with the same numeric `propLayout.density`. Scores for the five rows of the new low sheets are 1,2,3,2,3; medium rows are 4,5,6,7,5. The existing skyline sheets retain their twelve mixed low/mid-rise assets at scores 4–7 and eight towers at scores 8–10. All ten scores are represented. SSE exposes the ten density tags; per-cell tags remain authoritative on export.

All nine city sheets use layout version **6**. Older saved version-5 coordinates/tags must not bypass the density policy: invalidate them even when pixel rectangles did not move. New sheets are registered by the existing bundled-pair discovery and added to index.json. Nature versions remain 3.

## Explicit scale calibration

The user clarified that family houses must be visibly smaller than skyscrapers and allowed 2×1 bases for the smallest houses. This updates the earlier ratio-1 requirement for these six new sources only. Record and use **0.5** low-density and **0.75** medium-density import ratios; existing skyline sheets remain **1**. Target widths/heights are rounded source component dimensions times that ratio. Store original `bbox`, actual `renderRect`, `extension.imports.sizeRatio`, and `source.packing.scale` so no hidden normalization occurs. Copy native imports exactly; resample calibrated imports only during asset creation. Source originals remain intact. Do not add runtime zoom or per-frame image resizing.

Smallest one-story density-1 cottages have **2×1** impassable bases and a full upper image row tagged passable/overhang. Other low homes have at least 2×2 bases; larger duplexes may occupy 3×2. Medium blocks typically occupy 3×2 or 3×3. Skyscrapers stay at least 3×3. Full images retain complete group rectangles. Upper rows are passable/overhang, never impassable; base rows are impassable only. Flat art that fits wholly within its physical base needs no extra overlay. Family images are narrower and shorter than tower images at the same map scale. Use the vehicle factory's 3×3 base as the familiar reference.

## Settlement placement

A repeating four-settlement cycle has maximum density **3,7,7,10**: low-only village, two low/medium towns, then a city eligible for a skyline. No earlier settlement may borrow higher-density art, even when selected sheets lack appropriate lower-density buildings. The default two-city setting therefore gives a village and a town; four or more seeds allow a skyline. Terrain/road/base exclusions still take priority if no large lot fits.

Within a settlement, visit street lots from center outward. Keep the first 20% of its radius eligible for the maximum density, allowing real tower bases to fit curved central streets. Then taper the allowed score to one at the outskirts: `max(1, ceil(maximum * (1 - clamp((radius - 0.2) / 0.8, 0, 1))))`. Use seeded variety within the highest permitted architectural band (scores 8–10 for a skyline core, the highest two medium scores for town cores); fall back only to lower scores. This prevents the largest score from crowding out other tower designs. Cap the maximum by available catalog scores so legacy user sheets still use their full internal range. Untagged groups retain size-derived ordering 1–3, staying eligible in villages. Explicit tags fully override physical size. Dense architecture stays toward the center; smaller low-density homes fill outer streets and suitable remaining gaps.

Prepare density bags and placement records once per layout. Store cityIndex, maximum, score and radial position on city placements for inspection/testing. Preserve deterministic seeds, single-biome bases, streets, exclusions and variety. Existing overhang rendering, shared HP, indexed HUD visibility, click/drag selection and destruction serve all tiers.

## Frame and memory audit

Density selection runs only during layout preparation. No new per-tick, per-unit or per-frame density work is introduced. Ordinary small-house images are baked into prepared terrain; projected sprites use the existing culled draw pass. Existing HUD lookups remain indexed by center-based unit tiles. At 500 visible units and 200 overhead buildings, 75 Hz gives 37,500 tile queries and up to 15,000 prepared draws/second; pixel work scales with bounds and DPR squared, not a new map-sized fill. No hot-loop scans or allocations are added.

All active overhead images across nine city catalogs use **65,691,648 bytes at DPR 3**, below the existing **67,108,864-byte (64 MiB)** cap. Non-overhead low art is excluded from that cache. Keep the cap, final-DPR preparation, and controlled density swaps. Hardware 75 FPS acceptance remains pending on Patrick's qualifying GPU; headless functional checks cannot certify performance. No GPU/performance benchmark is run here.

## Validation

Unit coverage proves tagged architectural density overrides equal footprints; all eight settlements are populated on open land, only settlements 4/8 may contain scores 8–10, towns contain low/medium art, density falls toward edges, layouts are deterministic and forbidden higher-score fallback never occurs. Keep legacy central-size ordering coverage. Replay all eleven source profiles, verify calibrated/native dimensions and alpha silhouettes, tags, minima, bounds, provenance, encoding and every bundled sprite's placement path on both default two-settlement and eight-settlement maps.

Chromium checks isolate all six sources via actual SSE at recorded ratios; verify 2×1 bases, snowy tags and scores. Load all nine city catalogs at DPR 3 within budget and generate eight settlements in grass, soil, sand and snow; assert scale differences and skyline rarity/gradient. Existing overhang movement, visible HUD, real click/drag selection, destruction and default map selection checks remain active. Final suite counts and exact skipped browser scope are recorded in the change note.
