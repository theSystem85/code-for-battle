UTC: 2026-10-23T23:41:33.319191+00:00
Model: GPT-6, Codex harness. Exact model version, reasoning level, token counts and full task duration are unavailable.

User request:

> you have to rebuild all the dtv6 sprite sheets from sources again to get the correct sizes for all these new sprites. They appear way too large in the game map. analyse each image and find correct scale factor so the resulting sprites are compatible with the existing sprite sizes.

This explicitly authorizes per-prop scale calibration for the eight dtv6 atlases, overriding earlier ratio-1 imports for those sheets. Compare all source artwork against the existing 192px vehicle factory, dtv4 vegetation and dtv5 cottages; preserve source files and use recorded per-prop reference bounds/import ratios. Keep SSE extraction/packing, q85 WebP with alpha, original tags and all 236 props. Bump atlas layouts to 2 and reject obsolete applied/local/saved overrides. Standing authorization remains commit/push directly to dev without an MR. See specs/dtv6-world-scale-calibration.md and the full size report.
