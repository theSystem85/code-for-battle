// Canonical facing for every map image in public/images/map/units/.
//
// Rule: all unit map art faces SOUTH (front/nose/muzzle pointing down the image).
// Renderers rotate a south-facing image with `unit.direction - Math.PI / 2`
// (unit.direction 0 = east, PI/2 = south). Assets listed with 'north' are legacy
// aircraft art that predates the rule; their renderers use `+ Math.PI / 2`.
// Do NOT add new 'north' entries: rotate the asset 180 degrees instead.
// tests/unit/unitSpriteFacing.test.js fails when an asset is missing here or a new
// non-south entry appears.

export const CANONICAL_UNIT_FACING = 'south'

export const UNIT_SPRITE_FACING = Object.freeze({
  'aircraft_carrier_map.webp': 'south',
  'ambulance.webp': 'south',
  'ammunition_truck_map.webp': 'south',
  'apache_body_map.webp': 'south',
  'apache_map.webp': 'north',
  'apache_rotor_map.webp': 'symmetric',
  'battleship_barrel.webp': 'south',
  'battleship_map.webp': 'south',
  'battleship_turret.webp': 'south',
  'destroyer_map.webp': 'south',
  'f22_raptor_map.webp': 'north',
  'f35_map.webp': 'north',
  'harvester.webp': 'south',
  'hovercraft_map.webp': 'south',
  'howitzer_barrel.webp': 'south',
  'howitzer_map.webp': 'south',
  'lightTank_barrel.webp': 'south',
  'lightTank_turret.webp': 'south',
  'lightTank_wagon.webp': 'south',
  'mine_layer_map.webp': 'south',
  'minesweeper_map.webp': 'south',
  'naval_mine_layer_map.webp': 'south',
  'recovery_tank.webp': 'south',
  'rocket_tank.webp': 'south',
  'submarine_map.webp': 'south',
  'supply_ship_map.webp': 'south',
  'tankV1_barrel.webp': 'south',
  'tankV1_turret.webp': 'south',
  'tankV1_wagon.webp': 'south',
  'tankV2_barrel.webp': 'south',
  'tankV2_turret.webp': 'south',
  'tankV2_wagon.webp': 'south',
  'tankV3_barrel.webp': 'south',
  'tankV3_turret.webp': 'south',
  'tankV3_wagon.webp': 'south',
  'tank_m1.webp': 'south',
  'tanker_truck.webp': 'south',
  'vehicle_ferry_map.webp': 'south'
})

// Legacy exceptions frozen at their current set; shrinking it is welcome, growing it is not.
export const LEGACY_NON_SOUTH_UNIT_SPRITES = Object.freeze([
  'apache_map.webp',
  'f22_raptor_map.webp',
  'f35_map.webp'
])

/** Rotation offset to add to unit.direction for an asset's declared facing. */
export function facingRotationOffset(facing) {
  return facing === 'north' ? Math.PI / 2 : -Math.PI / 2
}
