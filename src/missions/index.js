import { mission01 } from './mission_01.js'
import { fullBaseTest } from './mission_full_base_test.js'

export const builtinMissions = [mission01, fullBaseTest]

export function getBuiltinMissionById(id) {
  return builtinMissions.find(mission => mission.id === id) || null
}
