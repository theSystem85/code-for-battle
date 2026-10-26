# Carrier and airstrip air wing

Apache helicopters can land on an airstrip as well as a helipad or aircraft carrier. F22 Raptors, F35s, and Apaches keep a home carrier or a home airstrip until the player explicitly sends them to a different carrier, airstrip, or (F35 and Apache) helipad. Attack, refill, and guard orders do not change that home.

## Carrier group orders

- Selecting a carrier and attacking, including force-attack, does not cancel the carrier's current move order and does not path the carrier to the target.
- Only aircraft physically on that carrier launch. Each of them receives the same attack target. Aircraft already airborne, and aircraft whose home is a different carrier, are left on their current orders.
- An aircraft that is on the deck without a home carrier becomes associated with that carrier. An aircraft that already has a different home is not retasked.
- Stop-attack on the selected carrier clears the strike and orders every aircraft assigned to that carrier to stop and land back on it, including aircraft that are already airborne.
- While a carrier strike or an individual attack from an associated aircraft is active, an F22, F35, or Apache that runs out of ammunition or does not have enough fuel to reach the carrier returns, reloads, and launches again. This repeats until the target is destroyed. A destroyed target sends the aircraft home to land, and it stays there.

## Airstrip group orders

- Selecting an airstrip and using attack, queued attack, force-attack, or guard applies that order to every F22, F35, and Apache based at that strip.
- Aircraft whose home is a carrier are not included.
- A move order on the strip does not drag the wing.

## Guard

- F35 and Apache follow the guarded unit. They attack whatever attacks that unit or themselves, return home to reload when they must, then resume the intercept. When the attacker is gone they follow again.
- An F22 stays at its port. When the guarded unit or the F22 is attacked, it takes off and attacks that attacker until the attacker is destroyed, including refill cycles on its airstrip or carrier, then returns to port. A scramble that has not left the parking spot is cancelled in place.

## Saved state

Live and saved state schema is 5. New fields are `homeAirstripId`, carrier strike and resume flags, and `airGuardInterceptId`. Migration 5 copies an existing airstrip id into `homeAirstripId` only when the aircraft has no home carrier, and it does not mutate the source save.

## Performance

Carrier strike, refill, and air-guard updates run once per carrier or per guarding aircraft each simulation tick. Guard follow reuses an existing flight plan instead of allocating one every tick. No per-entity canvas overlay was added. Hardware GPU acceptance for the 75 FPS gate remains pending on Patrick's qualifying hardware; no GPU benchmark was run.
