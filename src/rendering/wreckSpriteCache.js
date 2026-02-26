import { getTankImageAssets } from './tankImageRenderer.js'
import { getHarvesterBaseImage } from './harvesterImageRenderer.js'
import { getRocketTankBaseImage } from './rocketTankImageRenderer.js'
import { getAmbulanceBaseImage } from './ambulanceImageRenderer.js'
import { getTankerTruckBaseImage } from './tankerTruckImageRenderer.js'
import { getRecoveryTankBaseImage } from './recoveryTankImageRenderer.js'
import { getHowitzerBaseImage } from './howitzerImageRenderer.js'
import { getMineLayerBaseImage } from './mineLayerImageRenderer.js'
import { getMineSweeperBaseImage } from './mineSweeperImageRenderer.js'
import { getF22BaseImage } from './f22ImageRenderer.js'

const grayscaleCache = new WeakMap()

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createNoiseValue(index, seed = 0) {
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233)
  const fract = x - Math.floor(x)
  return fract * 2 - 1
}

function getDesaturatedCanvas(image) {
  if (!image || !image.width || !image.height) {
    return null
  }

  if (grayscaleCache.has(image)) {
    return grayscaleCache.get(image)
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = imageData
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha === 0) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b
      const noise = createNoiseValue(i / 4, luminance)
      const value = clamp(luminance + noise * 18, 0, 255)
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
    }
    ctx.putImageData(imageData, 0, 0)
  } catch (e) {
    window.logger.warn('Failed to process wreck image for grayscale', e)
  }

  grayscaleCache.set(image, canvas)
  return canvas
}

export function getTankWreckCanvases(unitType) {
  const assets = getTankImageAssets(unitType)
  if (!assets) return null
  return {
    wagon: getDesaturatedCanvas(assets.wagon),
    turret: getDesaturatedCanvas(assets.turret),
    barrel: getDesaturatedCanvas(assets.barrel)
  }
}

export function getSingleImageWreckSprite(unitType) {
  let image = null
  switch (unitType) {
    case 'harvester':
      image = getHarvesterBaseImage()
      break
    case 'rocketTank':
      image = getRocketTankBaseImage()
      break
    case 'ambulance':
      image = getAmbulanceBaseImage()
      break
    case 'tankerTruck':
      image = getTankerTruckBaseImage()
      break
    case 'recoveryTank':
      image = getRecoveryTankBaseImage()
      break
    case 'howitzer':
      image = getHowitzerBaseImage()
      break
    case 'mineLayer':
      image = getMineLayerBaseImage()
      break
    case 'mineSweeper':
      image = getMineSweeperBaseImage()
      break
    case 'f22Raptor':
      image = getF22BaseImage()
      break
    default:
      image = null
      break
  }

  if (!image) {
    return null
  }
  return getDesaturatedCanvas(image)
}

