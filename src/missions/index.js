import { mission01 } from './mission_01.js'
import { fullBaseTest } from './mission_full_base_test.js'
import { demoSave } from './mission_demo.js'

export const builtinMissions = [mission01, fullBaseTest, demoSave]

export function getBuiltinMissionById(id) {
  return builtinMissions.find(mission => mission.id === id) || null
}
