// Shape version of the live game state (units, buildings, map, resources).
// Bump it whenever a change renames, removes or restructures saved/live state.
// Groundwork for B-008 hot code push: the live-update manifest
// (build-info.json) carries this number, and a running game whose schema
// differs from a new deploy treats that deploy as breaking. Migration
// functions between schema versions are a follow-up.
export const GAME_STATE_SCHEMA_VERSION = 3
