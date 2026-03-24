import { gameState as globalGameState } from '../gameState.js'

const DEFAULT_FIXED_STEP_MS = 1000 / 60

export function getSimulationTime(state = globalGameState) {
  if (!state || !Number.isFinite(state.simulationTime)) {
    return 0
  }

  return state.simulationTime
}

export function advanceSimulationTime(deltaMs, state = globalGameState) {
  if (!state) return 0
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
  state.simulationTime = getSimulationTime(state) + safeDelta
  return state.simulationTime
}

export function getFixedSimulationStepMs(state = globalGameState) {
  const step = state?.simulationStepMs
  return Number.isFinite(step) && step > 0 ? step : DEFAULT_FIXED_STEP_MS
}
