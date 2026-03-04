# 049 - Balanced ore seed crystal street distance and ore distribution tiers

## Summary
Map generation must keep early-economy access fair while adding richer ore distribution. Every party gets a comparable near-base ore field reachable by street, larger shared ore opportunities in the center, and additional seed-driven random spread fields.

## Functional requirements
- Provide a sidebar map-settings input for ore field count (`mapOreFieldCount`) and store/load it from local settings.
- Generate one small near-base ore field per active party (2-4 parties).
- Place each party near-base seed crystal at approximately 30 street tiles from the start base (accepted range 24-36 tiles), with equal nearest street distance across all parties for the same map.
- Guarantee a street route from each party start base to that party's nearest seed crystal.
- Generate at least three larger ore fields near the map center.
- Generate several additional random spread ore fields whose positions vary by map seed.
- Ensure each generated ore field has one seed crystal in its center with regular ore around it.
- Increase default ore spread interval by 3x to slow growth speed.

## Acceptance criteria
1. Given any generated map with active parties, when measuring shortest street path length from each party start base to the nearest seed crystal, then all parties have the same distance value and that distance is within 24-36 tiles.
2. Given any generated map, when inspecting ore field distribution, then each party has a nearby small field, at least three larger center fields exist, and extra spread fields are present.
3. Given two different map seeds, when comparing spread-field placements, then at least one spread-field position differs.
4. Given default game configuration, when reading ore spread interval, then the value is 3x slower than the previous default.
5. Given the ore-field count input is changed, when a map is generated with the same seed and map settings, then generation is deterministic and uses exactly that number of ore fields (one center seed crystal per field).

## Validation
- Add and run a Playwright E2E test that verifies street-distance fairness, near/middle/spread ore layout expectations, ore-field count usage, and seed-dependent spread variation across multiple seeds.
