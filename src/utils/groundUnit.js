import { isNavalUnitType } from './navalUtils.js'

export function isGroundUnit(unit) {
  return Boolean(unit && !unit.isBuilding && !unit.isAirUnit && !unit.isNaval &&
    !['apache', 'f22Raptor', 'f35', 'c5Galaxy'].includes(unit.type) && !isNavalUnitType(unit.type))
}
