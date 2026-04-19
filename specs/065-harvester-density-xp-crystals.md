# 065 - Harvester crystal density and XP crystal-sheet integration

## Requirements
- Add crystal density as a per-tile scalar from 1..5 for ore and seed crystals.
- Harvesters can only mine up to a density cap based on stars:
  - 0 stars: up to density 2
  - 1 star: up to density 3
  - 2 stars: up to density 4
  - 3 stars: up to density 5
- Harvester XP star unlocks are based on total money earned by that harvester:
  - 10,000 => 1 star
  - 30,000 => 2 stars
  - 50,000 => 3 stars
- Progression effects:
  - each star grants +50% loading capacity
  - 2 stars grants +25% armor
  - 3 stars grants +25% speed
- Crystal visuals must reflect current density level, shrinking through density stages while being harvested.
- Ore spread behavior:
  - orthogonal neighbors gain density if already ore
  - otherwise free eligible neighbors begin at density 1
- Seed crystals also carry density 1..5 and spread faster proportionally by density multiplier.
- Default crystal sheet integration uses `images/map/sprite_sheets/crystals_q90_1024x1024.webp` and tag selection (`ore`, `red|blue`, `density_X`).

## Notes
- Save/load and map hashing include crystal density/color to preserve deterministic sync.
- Fallback rendering still works if the sheet is unavailable.
