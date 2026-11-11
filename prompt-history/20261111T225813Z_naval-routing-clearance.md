# 2026-11-11T22:58:13Z — Naval routing and coastline clearance

Model: GPT-6 (Codex desktop harness). Exact model revision, reasoning level, token counts, and total elapsed time are not exposed; no estimates are reported.

## User request

Bugfix: ensure naval units go do not end up in complex path planning when they are commanded to go to a simple remote position on the map where they basically just can get within 2 straight lines but often end up in very increasingly complex route planning like shown in the image. I assume the old recurring bug that units get blocked by their own occupancy could be a root cause candidate here again. currently occupancy map is also rendered red on water but make it yellow now to indicate that water is only accessible for naval units and in generals make tiles occupied by units (ground and naval) orange. another issue you should fix is the behaviour of large ships near the coastline where then tend to drive into the coast and then start inefficient evasion movements or get stuck. Ensure naval units keep a secure (depending on their length) distrance to the coastline so that when they turn they do not bump into the coast. put this fix directly as commit do dev branch!

The attached image is visual evidence of a ship near shore with a zigzag route; it is not a separate source of instructions.

## Result

Added hull-dependent coastline clearance to path planning and smoothing, direct open-water routing, safe offshore arrival targets, hull-specific route caching, bounded recovery detours, and yellow water/orange unit occupancy visualization. Preserved naval exclusion from land occupancy and center-based self-occupancy exemptions. Added unit/browser regression coverage and committed directly to dev as requested. See the accompanying change note for final validation and hardware limitations.
