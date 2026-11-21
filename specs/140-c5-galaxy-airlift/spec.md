# Spec 140: C-5 Galaxy airlift (draft)

**Branch:** `dev`  
**Status:** Draft — Patrick's requirements below are decided; several implementation details are still open  
**Created:** 2026-11-21 (Europe/Berlin)  
**Last Updated:** 2026-11-21 (Europe/Berlin)  
**Source:** voice-call discussion on 2026-11-21

A separate coding agent is implementing a first version via Codex in parallel with this document. **This spec is not an implementation task.** Do not use a documentation change to add unit code or weights. Approved Grok Imagine art is listed under [Art assets](#art-assets). Where an implementation draft filled in numbers that Patrick has not approved, those values are listed under Open questions and are **not** requirements.

---

## Overview

There is **no** Galaxy, airlift, or parachute code on `origin/dev` at the time this draft was written (`d052b13e`). The C-5 Galaxy is a new large air transport. Players load ground vehicles by **weight**, fly to a destination, and **airdrop the cargo by parachute**.

Decided requirements from Patrick:

- Every vehicle definition gets a realistic **weight in metric tons**.
- Galaxy cargo is **weight-based**, not unit-count-based, with a **122 t** capacity. Any combination of vehicles that fits under the limit can be loaded.
- Cargo is **airdropped by parachute**.
- The Galaxy is a **large multi-tile unit**, in the same class of battlefield presence as the existing ships (for example the aircraft-carrier map sprite is 214×857).
- When parked it occupies space for **3 landing zones on the lower part of the airstrip** (decided 2026-11-21).
- It is **produced at the airstrip**.
- Map sprite and build-button art must be generated with **Grok Imagine only**, never ChatGPT or any other image model. Patrick picked the map and build button on 2026-11-21; those files are committed (see [Art assets](#art-assets)). **No construction icon** will be made. Parachute frames and takeoff / landing animation art are not in that assets commit; Patrick asked the follow-up Codex wiring task to produce those.

The Grok Imagine rule applies to **any future game-asset images** as well, not only the Galaxy.

---

## User Stories

### User Story 1: A large airstrip transport

**Priority:** P0  
**As a** player  
**I want** to build a C-5 Galaxy at the airstrip  
**So that** I can move ground vehicles across the map by air

**Acceptance Criteria:**

- [ ] The C-5 Galaxy is a buildable air unit whose production building is the airstrip.
- [ ] It is visibly a large multi-tile unit on the battlefield, comparable in presence to ships such as the aircraft carrier (`public/images/map/units/aircraft_carrier_map.webp`, 214×857), not a 64×64 fighter-sized sprite at fighter scale.
- [ ] Selection, occupancy, pathing, takeoff, landing, and parking account for that large footprint. Parked, the Galaxy takes space for 3 landing zones on the lower part of the airstrip. Remaining pixel-level details may still be refined against the committed map sprite.
- [ ] Implementation uses the committed Grok Imagine map sprite and build button listed under Art assets. There is no construction icon.

---

### User Story 2: Weight-based cargo

**Priority:** P0  
**As a** player  
**I want** to load any mix of vehicles whose weights add up to at most 122 t  
**So that** I can choose a few heavy vehicles or more lighter ones without a hidden unit-count cap

**Acceptance Criteria:**

- [ ] Every vehicle definition has a realistic weight property in metric tons.
- [ ] The Galaxy's cargo capacity is 122 t. Loading is allowed for any combination whose summed weight is less than or equal to 122 t.
- [ ] A vehicle that would exceed remaining capacity cannot be loaded, with clear player feedback.
- [ ] There is no separate maximum number of cargo vehicles. A single vehicle heavier than 122 t cannot be loaded.
- [ ] Which unit types are airliftable (ground only, wrecks, etc.) is decided and documented before release if it is not already answered in Open questions.

---

### User Story 3: Parachute airdrop

**Priority:** P0  
**As a** player  
**I want** to order a loaded Galaxy to a drop location and have the cargo descend under parachutes  
**So that** I can deliver vehicles into the field without a runway at the destination

**Acceptance Criteria:**

- [ ] The player can order a loaded Galaxy to airdrop its cargo at a target location.
- [ ] Vehicles leave the aircraft and descend on parachutes onto the battlefield (the visual treatment can be simple, but it must read as a parachute airdrop).
- [ ] Vehicles become ordinary controllable units after they have landed.
- [ ] Invalid drop terrain (water, buildings, cliffs, or other blocked tiles) is handled in a decided, documented way — the exact rule is still an open question.
- [ ] What happens to cargo if the Galaxy is destroyed in flight is decided and documented (still open).

---

### User Story 4: Approved art, not guessed art

**Priority:** P0  
**As a** player (and as Patrick, reviewing assets)  
**I want** the Galaxy's map sprite and build button to come from Grok Imagine and from my pick  
**So that** the new unit matches the game's art standard

**Acceptance Criteria:**

- [x] The committed map sprite and build button were generated with Grok Imagine only and picked by Patrick on 2026-11-21. There is no construction icon.
- [ ] Implementation wires those committed files (see [Art assets](#art-assets)), not placeholders and not a replacement generated by another model.
- [ ] Parachute images and takeoff / landing animation are still to be produced in the follow-up wiring task (Patrick asked Codex to handle those). New game-asset images remain subject to the Grok Imagine rule unless Patrick directs otherwise for that task.
- [ ] The same Grok Imagine rule applies to any future code-for-battle game-asset images.

---

## Functional Requirements

### FR-001: Weight property on every vehicle

**Priority:** P0  
**Description:** Every vehicle definition carries a realistic weight in metric tons. The property is part of the unit definition (not a one-off Galaxy table). Air and naval units may also have a weight recorded for completeness; whether they can ever be cargo is an open question, but Patrick's cargo rule is about vehicles and a 122 t airlift capacity.

### FR-002: 122 t weight-based capacity

**Priority:** P0  
**Description:** Galaxy cargo capacity is 122 metric tons. Any combination of loadable vehicles whose weights sum to ≤ 122 t may be loaded. There is no unit-count capacity. A load that would exceed 122 t is rejected with clear feedback.

### FR-003: Parachute airdrop

**Priority:** P0  
**Description:** Loaded cargo is delivered by parachute airdrop at a player-ordered location, not by taxiing off a runway at the destination.

### FR-004: Large multi-tile unit

**Priority:** P0  
**Description:** The Galaxy is a large multi-tile unit, in the same size class on the battlefield as existing ships (aircraft carrier map sprite 214×857 is the reference example). It must not be implemented as a fighter-scale air unit with only a label change. When parked it occupies space for **3 landing zones on the lower part of the airstrip**. Render scale should follow the committed 512×512 map sprite; remaining pathing / selection details may still be refined.

### FR-005: Produced at the airstrip

**Priority:** P0  
**Description:** The Galaxy is produced at the airstrip. Further tech-tree prerequisites (if any) are an open question.

### FR-006: Approved Grok Imagine art

**Priority:** P0  
**Description:** Implementation must use the committed map sprite and build button listed under Art assets. Patrick picked them from Grok Imagine proposals on 2026-11-21. There is no construction icon. Do not replace these files with assets from another image model.

### FR-007: Grok Imagine only for game-asset images

**Priority:** P0  
**Description:** The committed Galaxy map sprite and build button, and any future game-asset images (sprites, build buttons, icons), must be generated with Grok Imagine, not ChatGPT or any other image model. Coding agents must not generate those images themselves. There is no construction icon.

### FR-008: Save, sync, and determinism

**Priority:** P0  
**Description:** Cargo, drop state, and weights participate in save/load and multiplayer command sync / state hash so matches stay deterministic. Exact field layout is an implementation detail, but the behaviour is required once the unit ships.

### FR-009: Player-facing cargo feedback

**Priority:** P1  
**Description:** The player can see how much of the 122 t capacity is used and what is on board. Exact UI treatment (selection panel, bar, tooltip) is an open question, but some clear readout is required.

### FR-010: User manual

**Priority:** P1  
**Description:** The user manual (`public/docs/user-documentation.html`) documents the Galaxy: airstrip production, 122 t capacity, that loading is by weight, and that delivery is a parachute airdrop.

---

## Success Criteria

### SC-001: Capacity math
Combinations at exactly 122 t load; combinations above 122 t are rejected; a single vehicle above 122 t is rejected. No hidden unit-count cap denies a combination that is within 122 t.

### SC-002: Visible airlift loop
A player can produce a Galaxy at the airstrip, load vehicles, fly, and receive those vehicles on the ground after a parachute descent.

### SC-003: Battlefield scale
On the map, the Galaxy reads as a large unit in the ship size class, not as a slightly bigger fighter.

### SC-004: Art gate
Committed final map and build-button art is Grok Imagine work that Patrick picked on 2026-11-21. Implementation uses those files, not placeholders. There is no construction icon.

### SC-005: Persistence
A save taken mid-load or mid-drop restores the same cargo and drop state; multiplayer peers stay in sync.

---

## Art assets

Patrick picked the C-5 Galaxy art on 2026-11-21 (Europe/Berlin). Both committed images were generated with **Grok Imagine** only. They are unused by gameplay code in this change (no unit registration). **No construction icon** is included or planned.

| Role | Path | Measured size |
|---|---|---|
| Map sprite (top-down, nose-up, desert camo, option 4) | `public/images/map/units/c5_galaxy_map.webp` | 512×512 RGBA, kept at high resolution because the unit renders as a multi-tile ship-class aircraft |
| Sidebar / build button (tank-loading shot, option 2) | `public/images/sidebar/c5_galaxy_sidebar.webp` | 256×256 RGB, matching existing aircraft build buttons |

![C-5 Galaxy map sprite](../../public/images/map/units/c5_galaxy_map.webp)

![C-5 Galaxy build button](../../public/images/sidebar/c5_galaxy_sidebar.webp)

Follow-up for the wiring task (not in this assets commit): Patrick asked Codex to render parachute images and to build takeoff and landing animation. The parked plane takes space for 3 landing zones on the lower part of the airstrip.

---

## Implementation-draft proposals (not decided)

A Codex implementation prompt written the same day suggested values so coding could start. **Patrick has not approved these.** They are recorded only so the next session can accept, change, or reject them:

- Suggested unit id `c5Galaxy`, display name "C-5 Galaxy".
- Suggested cost 6000, health about 300, unarmed, slower than fighters, armour in line with other aircraft.
- Suggested ground footprint about 3×3 tiles, with a real-world reminder of roughly 68 m wingspan / 75 m length, rendered at about 3–4× F-22 size. This may be **too small** relative to "like the existing ships" and the 214×857 carrier sprite; treat size as still open.
- Suggested `airliftable: true` for all ground vehicles and `false` for air and naval units; wrecks not mentioned.
- Suggested loading only while landed, with vehicles boarding in the same spirit as naval transports (hovercraft capacity 4, vehicle ferry capacity 10 — those are unit-count transports, unlike the Galaxy).
- Suggested drop: vehicles exit one after another, land on free passable land tiles near the target, stay on board and notify if no tile is free.
- Suggested UI: "X / 122 t" in the selection panel or tooltip, plus a small bar and a list of loaded vehicles.
- Suggested AI: need not build the Galaxy in v1.
- Suggested documentation of each weight with a reference vehicle in `docs/vehicle-weights.md`.
- Fate of cargo if the Galaxy is destroyed, and whether descending vehicles can be damaged, were explicitly left as "choose and document" in that prompt.

None of the above is a requirement of this spec until Patrick says so.

---

## Open questions

1. **Remaining footprint details** (selection box, collision radius, taxi pathing) for a ship-sized air unit. Decided: the parked Galaxy occupies space for 3 landing zones on the lower part of the airstrip. The committed map sprite is 512×512. The carrier sprite (214×857) remains the size-class reference, not a literal pixel size to copy.
2. **Cost, health, speed, armour, fuel, build time, and whether the Galaxy is armed.**
3. **Which types are airliftable.** All ground vehicles? Recovery wrecks? Other air units? Naval units? Units already carrying cargo?
4. **Numeric weight table.** Every vehicle needs a realistic tonnage, but the individual values and reference vehicles have not been approved.
5. **How loading is ordered and animated** (only while landed, boarding path, player command flow, cancellation).
6. **Airdrop rules:** drop one-by-one vs all at once; spread pattern; invalid terrain; can the player pick a precise tile; mid-drop cancellation; behaviour over water or enemy bases.
7. **Combat while loaded or descending:** is the Galaxy unarmed; can cargo or descending vehicles be shot; are they invulnerable until landing.
8. **Galaxy destroyed with cargo aboard, or during descent.** Cargo destroyed, scattered, or something else?
9. **Further tech-tree prerequisites** beyond "produced at the airstrip" (for example ammunition factory, radar, Technology Center).
10. **Enemy / LLM AI production** of the Galaxy in v1.
11. **UI details** of the 122 t readout and cargo list.
12. **Multiplayer and cheat-spawn** specifics (cheat id, late-join snapshot of in-air descents).
13. **Parachute frames and takeoff / landing animation** (Patrick asked the follow-up Codex wiring task to produce these; they are not in the 2026-11-21 assets commit).
14. **Sounds, milestones, and landing-page mention.**

---

## Out of scope

- Implementing the unit, weights, or parachute simulation in a documentation-only change.
- Replacing the committed Grok Imagine map sprite or build button with assets from another image model.
- Adding a construction icon (Patrick did not want one).

---

## References

- Existing large unit art: `public/images/map/units/aircraft_carrier_map.webp` (214×857)
- Committed Galaxy art: `public/images/map/units/c5_galaxy_map.webp` (512×512), `public/images/sidebar/c5_galaxy_sidebar.webp` (256×256)
- Existing unit-count transports, for contrast only: hovercraft `transportCapacity` 4, vehicle ferry `transportCapacity` 10, in `src/config.js`
- Airstrip production patterns: F-22 (`f22Raptor`) in `src/production/techTree.js` and `skills/new-unit/SKILL.md`
- Standing art rule, 2026-11-21: all new code-for-battle game-asset images are generated with Grok Imagine only
