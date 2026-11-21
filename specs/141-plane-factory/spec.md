# Spec 141: Plane Factory (draft)

**Branch:** `dev`  
**Status:** Draft — open questions must be decided before implementation  
**Created:** 2026-11-21 (Europe/Berlin)  
**Last Updated:** 2026-11-21 (Europe/Berlin)  
**Source:** art-approval discussion on 2026-11-21

This is a **draft**. Do not invent costs, prerequisites, footprints, or production rules to fill gaps. Resolve the Open questions section with Patrick before writing production code.

---

## Overview

The **Plane Factory** is a dedicated jet assembly building. In the current game, fighters (F-22 and F-35) are produced at the **Airstrip** (and the F-35 can also use a Helipad). There is no `planeFactory` / aircraft-factory building type, no production wiring, and no spec for this factory yet.

Patrick approved map and build-button art on 2026-11-21. The images are committed as unused assets only. This change does not register them in production, the tech tree, or `scripts/build-prepared-sprites.mjs`. No construction icon was made; the build button serves as that icon.

---

## Art assets

Picked by Patrick on 2026-11-21 (Europe/Berlin). Generated with **Grok Imagine** only.

| Role | Path | Size |
|---|---|---|
| Map sprite (map option 4) | `public/images/map/buildings/plane_factory_map.webp` | 192×192 RGBA |
| Sidebar / build button (button option 5, based on map 4) | `public/images/sidebar/plane_factory_sidebar.webp` | 256×256 RGB |

![Plane Factory map sprite](../../public/images/map/buildings/plane_factory_map.webp)

![Plane Factory build button](../../public/images/sidebar/plane_factory_sidebar.webp)

The map sprite is an isometric 3/4 view of a grey barrel-vault hangar with an open gable door, a flat-roofed side annex, a grey steel lattice gantry, and a stealth fighter on a short taxiway stub. The build button is a new eye-level desert hero shot of the same silhouette, not a composite of the map sprite.

---

## Open questions

Do not treat any of the following as decided.

1. **What it builds versus the Airstrip.** Does the Plane Factory replace airstrip production of jets, sit beside it (for example the factory assembles and the airstrip is only for parking, takeoff, and landing), or produce a different set of aircraft? Where the C-5 Galaxy and future air units are built is also open.
2. **Footprint.** The committed map sprite is 192×192, which matches the older 3×3 convention of 64 px per tile, but the footprint has not been chosen.
3. **Cost, build time, power, health, armour, sell value, and prerequisites.** Unknown. Possible prerequisites (Airstrip, Radar, Vehicle Factory, Technology Center, Ammunition Factory, and so on) are not decided.
4. **Relation to the Technology Center and the Airstrip.** The Technology Center draft ([Spec 139](../139-technology-center/spec.md)) unlocks a Drone Factory and a Spaceship Factory, not a Plane Factory. It is not decided whether this building is part of that late-game tier, a mid-game factory next to the Airstrip, or something else.
5. **Enemy AI and LLM AI.** Should computer players build a Plane Factory, and if so when? How does that interact with current airstrip-based jet production?

---

## Out of scope

- Implementing the Plane Factory or wiring the sprites into building data, production, or prepared-sprite generation.
- Inventing placeholder stats so coding can start without Patrick.
- Editing `docs/brainstorm.md`.

---

## References

- `skills/new-building/SKILL.md`
- [Spec 139: Technology Center (draft)](../139-technology-center/spec.md)
- [Spec 021: F22 Raptor](../021-f22-raptor-unit.md)
- [Spec 052: F35 VTOL Stealth Strike Fighter](../052-f35-unit.md)
- [Spec 140: C-5 Galaxy airlift (draft)](../140-c5-galaxy-airlift/spec.md)
- Standing art rule, 2026-11-21: all new code-for-battle game-asset images are generated with Grok Imagine only
