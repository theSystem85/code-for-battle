# Naval, carrier, AI, and map settings follow-up

## Implemented in this pass
- Ferry/hovercraft cargo HUD tooltip lists each loaded unit type/count on its own line.
- Shipyards may be placed against north, south, west, or east shorelines when the water half of the footprint overlaps water and the land half overlaps land.
- Map settings expose a start-money input; new games apply the sanitized value to the human money pool and each construction yard budget.
- Non-submarine ship sprites render 50% larger, while submarines keep their previous stealth/readability size.
- F22 and F35 sprites render at 50% scale while assigned to a carrier deck.
- Loaded ferries show move-into cursor feedback over valid land disembark targets.

## Remaining TODO
- Ferry loaded-at-water jitter: audit naval movement stop/reroute thresholds and add regression coverage.
- Ferry embark/disembark animation: rotate stern toward shore, lock commands during loading, and tween cargo between shore and hull.
- Carrier operations: smooth jet launch/landing by replacing rapid state jumps with eased deck-path interpolation.
- Enemy naval AI: select naval targets, retaliate when attacked, and group own ships into assault waves.
- Enemy strategic preference: assign each AI party a deterministic 50/50 naval-first or air-first tech order.
- Supply ship AI: send depleted or heavily damaged ships to shipyard service/supply ships, and deploy supply ships to naval groups.
- Naval collision/inertia: use spatial partitioning and image-footprint hull radii to avoid ship/shore overlap without per-frame all-pairs checks.
