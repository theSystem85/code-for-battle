const normalizeOwner = owner => owner === 'player' ? 'player1' : owner

export function hasOperationalBuilding(buildings, type, owner) {
  return (buildings || []).some(building => building.type === type && normalizeOwner(building.owner) === normalizeOwner(owner)
    && building.health > 0 && !building.isBeingSold)
}

export function hasResearchCenterPrerequisites(buildings, owner) {
  return hasOperationalBuilding(buildings, 'radarStation', owner) && hasOperationalBuilding(buildings, 'commandCenter', owner)
}
