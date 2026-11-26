import { gameState } from '../../gameState.js'
import { broadcastGameCommand } from '../../network/commandBroadcast.js'
import { COMMAND_TYPES } from '../../network/commandTypes.js'
import { applyMapAction } from './mapActionCommands.js'

export function dispatchMapAction(payload, context) {
  const remote = gameState.multiplayerSession?.isRemote && gameState.multiplayerSession.localRole !== 'host'
  if (!remote && !applyMapAction(payload, gameState.humanPlayer || 'player1', context)) return false
  broadcastGameCommand(COMMAND_TYPES.MAP_ACTION, payload)
  return true
}
