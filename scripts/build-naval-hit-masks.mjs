// Offline alpha masks: node scripts/build-naval-hit-masks.mjs
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const names = { destroyer: 'destroyer', supplyShip: 'supply_ship', hovercraft: 'hovercraft', vehicleFerry: 'vehicle_ferry', aircraftCarrier: 'aircraft_carrier', navalMineLayer: 'naval_mine_layer', battleship: 'battleship', submarine: 'submarine', battleshipTurret: 'battleship_turret', battleshipBarrel: 'battleship_barrel' }
const masks = {}
for (const [type, name] of Object.entries(names)) {
  const { data, info } = await sharp(`public/images/map/units/${name}${type === 'battleshipTurret' || type === 'battleshipBarrel' ? '' : '_map'}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const rows = []
  for (let y = 0; y < info.height; y++) {
    const runs = []
    let start = null
    for (let x = 0; x <= info.width; x++) {
      const visible = x < info.width && data[(y * info.width + x) * info.channels + 3] > 0
      if (visible && start === null) start = x
      if (!visible && start !== null) { runs.push(start, x); start = null }
    }
    rows.push(runs)
  }
  masks[type] = { width: info.width, height: info.height, rows }
}
await writeFile('src/input/navalImageMasks.json', `${JSON.stringify(masks)}\n`)
