# 049 - Balanced ore seed crystal street distance

## Summary
Map generation must keep early-economy access fair by ensuring each party start base has the same nearest distance to an ore seed crystal, and that this nearest crystal is reachable via street tiles.

## Functional requirements
- Generate one primary ore cluster center per active party (2-4 parties).
- Place each cluster center at a balanced inward offset from that party's start base so all parties share equal nominal street distance to their nearest seed crystal.
- Generate a guaranteed street connection from each party start base to that party's primary ore cluster center.
- Ensure at least one seed crystal exists at each primary ore cluster center.

## Acceptance criteria
1. Given any generated map and active parties, when measuring shortest street path length from each party's start base to the nearest seed crystal, then all parties return the same distance value.
2. Given any generated map and active parties, when validating reachability from each start base to nearest seed crystal, then a street-valid route exists for every party.

## Validation
- Add and run a Playwright E2E test that loads several map seeds with 4 players and verifies equal nearest street distances to seed crystals across all parties.
