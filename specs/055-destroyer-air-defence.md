# Destroyer air defence

Destroyers retain their primary cannon and automatically launch independent homing rockets at hostile airborne Apache, F-22 and F-35 units within 16 tiles, including while moving or attacking a surface target. Friendly, destroyed, grounded and carried aircraft are excluded.

Rockets reuse rocket turret tracking and impact behavior, deal 36 base damage and fire every 5666.67 ms. The rocket turret deals 6 × 18 damage per 8500 ms (6000 ms reload plus five 500 ms burst gaps); the destroyer therefore deals 50% of its sustained damage per minute. Each rocket consumes one ammunition and respects firing/loader restrictions. The main cannon cooldown and target remain independent.

CPU work: one O(N) airborne list per combat tick, then O(D × A) distance checks only for ready destroyers (N units, D destroyers, A airborne units). At 75 ticks/s with 1000 units, 20 destroyers and 30 aircraft, at most 75000 classification checks and 45000 distance checks/s; cooldowns skip the latter between launches. No canvas work or DPR-dependent rendering is added; DPR 2 does not multiply this CPU work. Runtime cooldowns use a WeakMap and require no saved-state migration.

Verification: focused unit coverage for targeting, independent cooldowns, ammunition and damage balance; full unit suite and lint required. Hardware 75 FPS acceptance remains pending for Patrick on dev; no hardware GPU is verified in this environment.
