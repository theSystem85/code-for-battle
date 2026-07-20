# Six-Ship Naval Fleet Expansion — Implementation Plan

- [x] Phase 0 — Record the request, inspect existing naval/air/mine architecture, and define shared requirements.
- [x] Phase 1 — Generate and prepare transparent top-down map sprites plus sidebar build art for all six ships, matching the existing naval visual language.
- [x] Phase 2 — Add shared fleet data/configuration: naval classification, production/prerequisites, stats, ammo/fuel/crew, size-aware rendering/collision/selection, spawning, cheats, AI visibility, and save/sync defaults.
- [x] Phase 3 — Implement embarked-cargo foundations and the Hovercraft: shoreline load/unload commands, four-vehicle capacity, fast/light balance, HUD, persistence, destruction behavior, and tests.
- [x] Phase 4 — Implement the Vehicle Ferry on the shared transport system: ten-vehicle capacity, slow/heavy balance, safe multi-unit unloading, HUD, AI, persistence, and tests.
- [x] Phase 5 — Implement the Aircraft Carrier: realistic Destroyer-relative scale, weighted deck slots, heading-local deck transforms, F22 runway-like launch/recovery animations, F35 deck operations, fuel/ammo-only service, stores, persistence, AI, and tests.
- [x] Phase 6 — Implement water mines and the Naval Mine Layer/Sweeper: naval-only deployment/triggering, larger trigger/damage radii, safe sweeping, water path avoidance, chain reactions, rendering, commands, persistence, AI exposure, and tests.
- [x] Phase 7 — Implement the Battleship: four heavy gun mounts grouped into independent fore/aft batteries, sub-selection/hit testing, dual target state, independent cooldowns/projectiles, HUD/range overlays, persistence, AI, and tests.
- [x] Phase 8 — Implement the Submarine and Destroyer depth charges: submerged owner-only 30%-opacity rendering, proximity contact detection, attackability gates, surface/submerge animations, ship-only torpedoes, depth-charge detonation, persistence, AI, and tests.
- [x] Phase 9 — Integrate all ships with AI/LLM production and behavior surfaces, replay/multiplayer/state hash, save/load migration, minimap/shadow-of-war, combat target filters, service logistics, destruction, and documentation.
- [x] Phase 10 — Run changed-file lint auto-fix, the full unit suite, and a production build; resolve root causes and update this plan/TODO/spec status.
