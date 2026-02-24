import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const TILE_SIZE = 32
const outputFile = path.resolve('public/data/unit-collision-bounds.json')

const unitCollisionAssetMap = {
  tank_v1: 'public/images/map/units/tankV1_wagon.webp',
  'tank-v2': 'public/images/map/units/tankV2_wagon.webp',
  tank_v2: 'public/images/map/units/tankV2_wagon.webp',
  'tank-v3': 'public/images/map/units/tankV3_wagon.webp',
  tank_v3: 'public/images/map/units/tankV3_wagon.webp',
  harvester: 'public/images/map/units/harvester.webp',
  rocketTank: 'public/images/map/units/rocket_tank.webp',
  recoveryTank: 'public/images/map/units/recovery_tank.webp',
  ambulance: 'public/images/map/units/ambulance.webp',
  tankerTruck: 'public/images/map/units/tanker_truck.webp',
  ammunitionTruck: 'public/images/map/units/ammunition_truck_map.webp',
  mineLayer: 'public/images/map/units/mine_layer_map.webp',
  mineSweeper: 'public/images/map/units/minesweeper_map.webp',
  howitzer: 'public/images/map/units/howitzer_map.webp',
  apache: 'public/images/map/units/apache_body_map.webp'
}

function computeBoundsFromRgba(raw, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = raw[(y * width + x) * 4 + 3]
      if (alpha > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: TILE_SIZE, maxY: TILE_SIZE }
  }

  const scale = TILE_SIZE / Math.max(width, height)
  return {
    minX: Number((minX * scale).toFixed(3)),
    minY: Number((minY * scale).toFixed(3)),
    maxX: Number(((maxX + 1) * scale).toFixed(3)),
    maxY: Number(((maxY + 1) * scale).toFixed(3))
  }
}

async function generateBounds() {
  const unitBounds = {}

  for (const [unitType, assetPath] of Object.entries(unitCollisionAssetMap)) {
    const absolutePath = path.resolve(assetPath)
    const { data, info } = await sharp(absolutePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    unitBounds[unitType] = computeBoundsFromRgba(data, info.width, info.height)
  }

  const payload = {
    generatedAtUtc: new Date().toISOString(),
    tileSize: TILE_SIZE,
    alphaThreshold: 8,
    unitBounds
  }

  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${outputFile}`)
}

generateBounds().catch(error => {
  console.error('Failed to generate unit collision bounds:', error)
  process.exitCode = 1
})
