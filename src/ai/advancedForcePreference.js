import { gameRandom } from '../utils/gameRandom.js'

export function ensureAdvancedForcePreference(state, aiPlayerId) {
  state.aiAdvancedForcePreferences = state.aiAdvancedForcePreferences || {}
  if (!state.aiAdvancedForcePreferences[aiPlayerId]) {
    state.aiAdvancedForcePreferences[aiPlayerId] = gameRandom() < 0.5 ? 'naval-first' : 'air-first'
  }
  return state.aiAdvancedForcePreferences[aiPlayerId]
}
