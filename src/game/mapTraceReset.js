// mapTraceReset.js
// Clears transient, client-visible traces of a previous match (explosions,
// smoke, mine sweeper dust, land and naval mines) when a fresh match starts on
// a restart or "new map". Track marks clear themselves through the map
// lifecycle listener in trackMarks.js, and tile decals (impacts, craters,
// debris) live on the regenerated tiles, so neither needs handling here.
// Loading a savegame does not call this: the loader restores mines and smoke
// from the save on its own.

function emptyArray(list) {
  if (Array.isArray(list)) list.length = 0
}

/**
 * @param {Object} state - gameState
 * @param {Object} [options]
 * @param {Array[]} [options.explosionLists] - extra explosion arrays to empty,
 *   e.g. the host-side list exported by logic.js that gameState.explosions
 *   aliases after the first host update.
 */
export function clearTransientMapTraces(state, { explosionLists = [] } = {}) {
  if (!state) return
  explosionLists.forEach(emptyArray)
  if (Array.isArray(state.explosions)) {
    state.explosions.length = 0
  } else {
    state.explosions = []
  }
  state.smokeParticles = []
  state.smokeParticlePool = []
  state.dustParticles = []
  state.mines = []
  state.waterMines = []
}
