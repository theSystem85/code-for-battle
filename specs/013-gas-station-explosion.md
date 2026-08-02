# Spec 013: Gas Station Explosion Safety and Damage Rings

## Summary
When a gas station is destroyed, its explosion should severely damage nearby assets with predictable tile-based falloff without instantly deleting construction yards. Enemy AI placement must keep gas stations well away from the structures required to keep its base operational.

## Requirements
- Gas station destruction has a radius of exactly four tiles, including targets on the four-tile boundary.
- Damage uses four discrete one-tile rings measured from the explosion origin: 100% in the innermost ring, then 75%, 50%, and 25% in the outermost ring.
- Construction yards hit by that explosion take **no more than 90% of their maximum health** as damage (i.e., they always retain at least 10% health after the blast if undamaged beforehand).
- The same four-ring multipliers apply to units, wrecks, factories, and buildings.
- The explosion configuration should remain centralized in the gas station destruction logic to avoid altering unrelated explosion behaviors.
- The 90%-of-maximum-health damage cap applies whether a construction yard is represented in the factory collection or the general building collection.
- Enemy gas stations must keep their explosion origin at least six tiles from the footprint of every owned construction yard, ore refinery, power plant, and vehicle factory. This leaves a two-tile buffer beyond the four-tile blast.
- Placement must also validate the complete 3×3 gas-station footprint against the complete critical-building footprint and leave at least two wholly empty tile rows or columns between their outer occupied tiles. Center-point distance alone is not sufficient.
- The placement constraint applies to LLM-requested positions, the advanced search, its fallback search, the simple emergency search, and final placement validation after construction completes.
