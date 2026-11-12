// Keep mine, rocket, shell and building ammunition in their native storage fields.
// Scalar lookups avoid allocating state objects in simulation and cursor loops.
export function getAmmoCapacityKey(target) {
  if (target.type === 'mineLayer') return 'mineCapacity'
  if (target.type === 'apache' || target.type === 'f35') return 'maxRocketAmmo'
  if (target.isBuilding || typeof target.tileX !== 'number' && typeof target.maxAmmo === 'number') return 'maxAmmo'
  return 'maxAmmunition'
}

export function getAmmoCurrentKey(target) {
  const capacityKey = getAmmoCapacityKey(target)
  if (capacityKey === 'mineCapacity') return 'remainingMines'
  if (capacityKey === 'maxRocketAmmo') return 'rocketAmmo'
  if (capacityKey === 'maxAmmo') return 'ammo'
  return 'ammunition'
}

export function needsAmmo(target) {
  return typeof target[getAmmoCapacityKey(target)] === 'number' &&
    target[getAmmoCurrentKey(target)] < target[getAmmoCapacityKey(target)]
}
