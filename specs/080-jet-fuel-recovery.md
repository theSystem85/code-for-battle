# Spec 080: Jet fuel, emergency landing, and recovery-tank tow

## Scope
F22 Raptor and F35 strike jets (there is no F25 unit in this repo) must not be stranded on impossible missions, and players must be able to recover them when they still run out of fuel.

## Requirements
1. **Return home before fuel runs out**
   - While airborne, a jet must request RTB when remaining fuel is only enough to reach its home airstrip/helipad/carrier, including a small safety margin.
   - Do not use a fixed 20%/18% tank ratio as the primary trigger when a home position is known.
2. **Refuse impossible targets before takeoff**
   - Before a jet starts toward a non-landing target, estimate fuel for outbound + inbound + takeoff reserve.
   - If the current tank cannot cover that round trip, do not start the mission.
   - Show: `Insufficient fuel for a round trip.`
3. **Out-of-fuel emergency landing**
   - If an F22 or F35 still reaches 0 fuel in the air, it must land on the ground and stay alive.
   - Reuse the existing landing animation/sound (`f22Landing` / F35 VTOL descent). Do not use the fatal crash wreck sequence.
   - Show: `Jet landed due to fuel.`
4. **Tanker refill on the ground**
   - A grounded out-of-fuel jet is a valid tanker target and fills to the normal near-full threshold (not the 20% "get a tank rolling" emergency cap).
5. **Recovery tank street tow**
   - A grounded emergency-landed jet that is not on a street/airstrip cannot take off.
   - Recovery tanks can mount that jet with the existing `towedUnit` mechanic (same as crew-immobilized tanks).
   - After the jet is on a street (or airstrip/helipad/carrier), it may take off again. F22s without a nearby runway use a short street takeoff that reuses the existing takeoff climb/sound.
6. **S releases any mounted unit**
   - Pressing S on a recovery tank (or similar mount vehicle) that has `towedUnit` / `towedWreck` releases that cargo. This is not jet-specific.

## Implementation notes
- Shared helpers live in `src/game/jetFuel.js`.
- Fuel math matches `movementCore` cruise burn: `gasConsumption * meters / 100000`, with F22's existing 3x cruise multiplier and extra takeoff reserve.
- Occupancy for towed units uses center-based tile coordinates.

## Manual test
1. Order a full-fuel F22/F35 at an airstrip to a nearby target: it takes off and later RTBs with fuel remaining.
2. Order the same jet to a map-far target it cannot reach and return from: mission is refused with the insufficient-fuel notification and the jet stays parked.
3. Cheat or drain an airborne jet to 0 fuel: it descends with the landing animation, stays alive, and shows the landed-due-to-fuel notification.
4. Select a tanker and click the grounded jet: it refills.
5. If the jet is on grass, it cannot take off until a recovery tank mounts it and tows it onto a street; then issue a new order.
6. With the recovery tank still mounting any unit (jet or tank), press S: the cargo is released.
