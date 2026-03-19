import { getLlmSettings } from './llmSettings.js'

function hasStrategicBacklog(state, partyId) {
  if (!state?.llmStrategic || !partyId) {
    return false
  }

  const plan = state.llmStrategic.plansByPlayer?.[partyId]
  if (plan?.notes || (Array.isArray(plan?.actions) && plan.actions.length > 0)) {
    return true
  }

  const buildQueue = state.llmStrategic.buildQueuesByPlayer?.[partyId] || []
  const unitQueue = state.llmStrategic.unitQueuesByPlayer?.[partyId] || []
  return buildQueue.length > 0 || unitQueue.length > 0
}

export function isPartyUsingLlmStrategic(partyId, state, settings = getLlmSettings()) {
  if (!partyId) {
    return false
  }

  const partyStates = Array.isArray(state?.partyStates) ? state.partyStates : []
  if (partyStates.length > 0) {
    const partyState = partyStates.find(party => party.partyId === partyId)
    if (partyState) {
      if (partyState.aiActive === false) {
        return false
      }
      if (partyState.llmControlled === true) {
        return true
      }
      if (partyState.llmControlled === false) {
        return false
      }
    }
  }

  if (hasStrategicBacklog(state, partyId)) {
    return true
  }

  return Boolean(settings?.strategic?.enabled)
}