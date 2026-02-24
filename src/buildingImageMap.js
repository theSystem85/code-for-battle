// buildingImageMap.js
// Maps building types to their image assets

// Building image cache to store loaded images
const buildingImageCache = {}

// Map building types to their image paths
export const buildingImageMap = {
  powerPlant: 'images/map/buildings/power_plant.webp',
  oreRefinery: 'images/map/buildings/refinery.webp',
  vehicleFactory: 'images/map/buildings/vehicle_factory.webp',
  vehicleWorkshop: 'images/map/buildings/vehicle_workshop.webp',
  radarStation: 'images/map/buildings/radar_station.webp',
  hospital: 'images/map/buildings/hospital.webp',
  helipad: 'images/map/buildings/helipad_map.webp',
  airstrip: 'images/map/buildings/airstrip_map.webp',
  gasStation: 'images/map/buildings/gas_station.webp',
  turretGunV1: 'images/map/buildings/turret01_base.webp', // Use base image as fallback when turret images are disabled
  turretGunV2: 'images/map/buildings/turret02_base.webp',
  turretGunV3: 'images/map/buildings/turret03_base.webp',
  rocketTurret: 'images/map/buildings/rocket_gun.webp',
  teslaCoil: 'images/map/buildings/teslacoil.webp',
  constructionYard: 'images/map/buildings/construction_yard.webp',
  concreteWallCross: 'images/map/buildings/concrete_wall_cross.webp',
  concreteWallHorizontal: 'images/map/buildings/concrete_wall_horizontal.webp',
  concreteWallVertical: 'images/map/buildings/concrete_wall_vertical.webp',
  // Default wall entry kept for backward compatibility
  concreteWall: 'images/map/buildings/concrete_wall_cross.webp',
  artilleryTurret: 'images/map/buildings/artillery_turret.webp',
  ammunitionFactory: 'images/map/buildings/ammunition_factory_map.webp'
}

// Track loading state
let buildingImagesPreloaded = false
let buildingImagesLoading = false

// Get cached building image or load and cache it
export function getBuildingImage(buildingType, callback) {
  // Return cached image if available
  if (buildingImageCache[buildingType]) {
    if (callback) {
      callback(buildingImageCache[buildingType])
    }
    return buildingImageCache[buildingType]
  }

  // Get the image path from the mapping
  const imagePath = buildingImageMap[buildingType]

  if (!imagePath) {
    window.logger.warn(`No image mapping found for building type: ${buildingType}`)
    if (callback) callback(null)
    return null
  }

  // Load the source image
  const img = new Image()
  img.onload = () => {
    // Store the original image in the cache
    buildingImageCache[buildingType] = img

    // Return the original image
    if (callback) callback(img)
  }

  img.onerror = () => {
    console.error(`Failed to load building image: ${imagePath}`)
    if (callback) callback(null)
  }

  img.src = imagePath
  return null // Return null for async loading
}

// Preload all building images
export function preloadBuildingImages(callback) {
  // Don't reload if already loaded or loading
  if (buildingImagesPreloaded || buildingImagesLoading) {
    if (callback && buildingImagesPreloaded) {
      callback()
    }
    return
  }

  buildingImagesLoading = true

  // Count total images to preload
  const totalImages = Object.keys(buildingImageMap).length
  let loadedImages = 0

  // For each building type
  for (const buildingType of Object.keys(buildingImageMap)) {
    getBuildingImage(buildingType, (_img) => {
      loadedImages++

      if (loadedImages === totalImages) {
        buildingImagesPreloaded = true
        buildingImagesLoading = false
        if (callback) callback()
      }
    })
  }
}

// Clear the cache (useful for memory management or testing)
export function clearBuildingImageCache() {
  for (const key in buildingImageCache) {
    delete buildingImageCache[key]
  }
  buildingImagesPreloaded = false
}

// Get cache stats for debugging
export function getBuildingImageCacheStats() {
  return {
    size: Object.keys(buildingImageCache).length,
    keys: Object.keys(buildingImageCache),
    preloaded: buildingImagesPreloaded
  }
}
