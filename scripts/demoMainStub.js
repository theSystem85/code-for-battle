export const units = []
export const bullets = []
export const factories = []
export const mapGrid = []
export const buildingCosts = {}
export const unitCosts = {}
export const selectedUnits = []

export function getCurrentGame() {
  return null
}

export function showNotification() {}
export function sanitizeMapDimension(value) { return value }
export function resolveMapSeed(value) { return value }
export function loadPersistedSettings() {}
export function regenerateMapForClient() {}
export function updateVehicleButtonStates() {}
export function updateBuildingButtonStates() {}

export const MAP_SEED_STORAGE_KEY = 'mapSeed'
export const PLAYER_COUNT_STORAGE_KEY = 'playerCount'
export const ORE_FIELD_COUNT_STORAGE_KEY = 'oreFieldCount'
export const ORE_TOTAL_VALUE_STORAGE_KEY = 'oreTotalValue'
export const MAP_WIDTH_TILES_STORAGE_KEY = 'mapWidth'
export const MAP_HEIGHT_TILES_STORAGE_KEY = 'mapHeight'
