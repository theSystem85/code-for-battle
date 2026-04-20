# Spec 065: SSE rectangular group tags + grouped terrain/debris selection

## Scope
- Add a `group` tagging workflow to Sprite Sheet Editor (SSE).
- Allow assigning numeric group labels (`group_X`, X in 1..999) while painting.
- Restrict grouped paint operations to rectangular regions.
- Use grouped variants at runtime for `rocks`, `decorative`, and `debris` tags.

## SSE behavior
1. `group` exists in the static default SSE tag list.
2. Sidebar shows `group id` numeric input directly under `Add tag` input.
3. When active tag is `group` and user drags on tiles:
   - The drag operation is interpreted as rectangle paint only.
   - All tiles in the rectangle get only `group_X` (no plain `group` tile tag persisted).
   - Existing `group` / `group_*` tags on affected tiles are replaced.
4. On mouse release after group paint, `group id` auto-increments by 1 up to max 999.
5. Single-tile clicks do not create groups; grouped assignment requires at least 2 tiles.
6. If Group mode clicks a tile that already has a group label and no drag rectangle is formed, that tile’s group label is removed.
7. Group drag feedback is immediate once coverage reaches at least 2 tiles, and Group-highlight overlay is yellow while drawing.
8. Removing one tile from an existing group removes the full matching `group_X` cluster from the sheet metadata.

## Runtime grouping behavior
1. Group definitions are valid only when a `group_X` cluster forms a perfect rectangle.
2. Grouped selection applies to:
   - Rocks (`rocks`/`rock`)
   - Decorative land tiles (`decorative`)
   - Debris decals (`debris`)
3. Runtime prefers larger grouped variants before smaller ones when matching map footprints.
4. Debris placement uses destroyed building footprint dimensions; if no matching grouped debris exists, fallback to regular 1x1 debris selection.
5. Group-tagged tiles are exclusive to their declared rectangle and must never be selected by non-group candidate paths (including 1x1 fallback) or by partial/smaller implicit group usage.

## Persistence
- Decal save/load payload includes grouped footprint metadata (`groupWidth`, `groupHeight`, `groupOriginX`, `groupOriginY`) so grouped debris rendering survives save/resume.
