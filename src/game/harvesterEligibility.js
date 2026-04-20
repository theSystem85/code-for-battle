export function getHarvesterLevel(unit) {
  return Math.max(0, Math.min(3, Number.isFinite(unit?.level) ? unit.level : 0))
}

export function getTileDensity(tile, isSeed = false) {
  if (!tile) return 1

  const rawDensity = isSeed ? tile.seedCrystalDensity : tile.oreDensity
  return Math.max(1, Math.min(5, Number.isFinite(rawDensity) ? Math.floor(rawDensity) : 1))
}

export function getHarvesterMaxHarvestDensity(unit) {
  return Math.min(5, 2 + getHarvesterLevel(unit))
}

export function getRequiredHarvesterLevelForTile(tile) {
  if (!tile?.ore || tile.seedCrystal) {
    return null
  }

  return Math.max(0, getTileDensity(tile, false) - 2)
}

export function canHarvesterHarvestTile(unit, tile) {
  const requiredLevel = getRequiredHarvesterLevelForTile(tile)
  if (requiredLevel === null) {
    return false
  }

  return getHarvesterLevel(unit) >= requiredLevel
}
