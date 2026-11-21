# Spec 140: C-5 Galaxy airlift (draft)

**Branch:** `dev`  
**Status:** Draft — Patrick's requirements below are decided; several implementation details are still open  
**Created:** 2026-11-21 (Europe/Berlin)  
**Last Updated:** 2026-11-21 (Europe/Berlin)  
**Source:** voice-call discussion on 2026-11-21

A separate coding agent is implementing a first version via Codex in parallel with this document. **This spec is not an implementation task.** Do not use this documentation change to add unit code, weights, or images. Where an implementation draft filled in numbers that Patrick has not approved, those values are listed under Open questions and are **not** requirements.

---

## Overview

There is **no** Galaxy, airlift, or parachute code on `origin/dev` at the time this draft was written (`d052b13e`). The C-5 Galaxy is a new large air transport. Players load ground vehicles by **weight**, fly to a destination, and **airdrop the cargo by parachute**.

Decided requirements from Patrick:

- Every vehicle definition gets a realistic **weight in metric tons**.
- Galaxy cargo is **weight-based**, not unit-count-based, with a **122 t** capacity. Any combination of vehicles that fits under the limit can be loaded.
- Cargo is **airdropped by parachute**.
- The Galaxy is a **large multi-tile unit**, in the same class of battlefield presence as the existing ships (for example the aircraft-carrier map sprite is 214×857).
- It is **produced at the airstrip**.
- Its three images (map sprite, build-button icon, construction icon) must be generated with **Grok Imagine only**, never ChatGPT or any other image model. Proposals were shown to Patrick on 2026-11-21; **picks are still pending**. Until he approves the art, implementation may use only **placeholder** graphics. Approved art is committed later.

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
- [ ] Selection, occupancy, pathing, takeoff, landing, and parking account for that large footprint (exact tile footprint is still open).
- [ ] Until Patrick approves Grok Imagine art, the unit ships with clearly temporary placeholder art, documented as such, and no unapproved final images are committed.

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
**I want** the Galaxy's map sprite, build button, and construction icon to come from Grok Imagine and from my pick  
**So that** the new unit matches the game's art standard

**Acceptance Criteria:**

- [ ] All three Galaxy images are generated with Grok Imagine only. ChatGPT, OpenAI image models, Codex, or any other generator must not produce the committed assets.
- [ ] Proposals are previewed to Patrick. He picks before any final image is committed. Proposals were already shown on 2026-11-21; the pick is pending as of this draft.
- [ ] Implementation that lands before the pick uses placeholder art only (for example a tinted or scaled existing sprite, or a procedural silhouette) and says so in the change notes.
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
**Description:** The Galaxy is a large multi-tile unit, in the same size class on the battlefield as existing ships (aircraft carrier map sprite 214×857 is the reference example). It must not be implemented as a fighter-scale air unit with only a label change. Exact footprint, render scale, and landing clearance are still open.

### FR-005: Produced at the airstrip

**Priority:** P0  
**Description:** The Galaxy is produced at the airstrip. Further tech-tree prerequisites (if any) are an open question.

### FR-006: Placeholder art until approval

**Priority:** P0  
**Description:** Do not commit final Galaxy map, build-button, or construction images until Patrick has picked from Grok Imagine proposals. Until then, use documented placeholders. Proposals were shown 2026-11-21; picks are pending.

### FR-007: Grok Imagine only for game-asset images

**Priority:** P0  
**Description:** The three Galaxy images, and any future game-asset images (sprites, build buttons, icons), must be generated with Grok Imagine, not ChatGPT or any other image model. Coding agents must not generate those images themselves.

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
Committed final art is Grok Imagine work that Patrick picked. Placeholders are clearly temporary.

### SC-005: Persistence
A save taken mid-load or mid-drop restores the same cargo and drop state; multiplayer peers stay in sync.

---

## Art status (2026-11-21)

- Three images are required: map sprite, build-button icon, construction icon.
- Generator: **Grok Imagine only**.
- Proposals were shown to Patrick on 2026-11-21. **Picks are pending.**
- Until approval, any implementation uses placeholder art only and must not add unapproved image files as if they were final.

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

1. **Exact footprint, render scale, selection box, collision radius, and airstrip parking / landing rules** for a ship-sized air unit. A 3×3 draft may be too small; the carrier sprite (214×857) is the size-class reference, not a literal pixel size to copy.
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
13. **Patrick's art pick** among the 2026-11-21 Grok Imagine proposals, and any revision after that pick.
14. **Sounds, milestones, and landing-page mention.**

---

## Out of scope

- Implementing the unit, weights, parachute simulation, or images in this documentation change.
- Committing final art before Patrick's pick.
- Generating game-asset images with any model other than Grok Imagine.

---

## References

- Existing large unit art: `public/images/map/units/aircraft_carrier_map.webp` (214×857)
- Existing unit-count transports, for contrast only: hovercraft `transportCapacity` 4, vehicle ferry `transportCapacity` 10, in `src/config.js`
- Airstrip production patterns: F-22 (`f22Raptor`) in `src/production/techTree.js` and `skills/new-unit/SKILL.md`
- Standing art rule, 2026-11-21: all new code-for-battle game-asset images are generated with Grok Imagine only
