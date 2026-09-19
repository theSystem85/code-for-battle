import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_ROOT = path.join(ROOT, 'public/images/prepared')
const TILE_SIZE = 32
const DENSITIES = Object.freeze([1, 2, 3])
const WEBP_QUALITY = 85
const APACHE_BUCKET_DEGREES = Object.freeze(Array.from({ length: 48 }, (_, index) => index * 7.5))
const APACHE_TILT_STATES = Object.freeze(['neutral', 'forward', 'backward', 'left', 'right'])

const unitSource = name => `images/map/units/${name}`
const buildingSource = name => `images/map/buildings/${name}`

const definitions = [
  ...['tankV1', 'tankV2', 'tankV3'].flatMap(variant => [
    {
      id: `unit:${variant}:wagon`,
      source: unitSource(`${variant}_wagon.webp`),
      target: { reference: unitSource(`${variant}_wagon.webp`), maxDimension: TILE_SIZE },
      anchors: { center: [0.5, 0.5], turretMountSource: [19, 32] },
      states: ['base']
    },
    {
      id: `unit:${variant}:turret`,
      source: unitSource(`${variant}_turret.webp`),
      target: { reference: unitSource(`${variant}_wagon.webp`), maxDimension: TILE_SIZE },
      anchors: { center: [0.5, 0.5], barrelMountSource: [17, 35] },
      states: ['base']
    },
    {
      id: `unit:${variant}:barrel`,
      source: unitSource(`${variant}_barrel.webp`),
      target: { reference: unitSource(`${variant}_wagon.webp`), maxDimension: TILE_SIZE },
      anchors: { center: [0.5, 0.5], muzzleSource: [2, 64] },
      states: ['base', 'recoil']
    }
  ]),
  ...[
    ['harvester', 'harvester.webp'],
    ['rocketTank', 'rocket_tank.webp'],
    ['ambulance', 'ambulance.webp'],
    ['tankerTruck', 'tanker_truck.webp'],
    ['recoveryTank', 'recovery_tank.webp'],
    ['ammunitionTruck', 'ammunition_truck_map.webp'],
    ['mineLayer', 'mine_layer_map.webp'],
    ['mineSweeper', 'minesweeper_map.webp']
  ].map(([type, filename]) => ({
    id: `unit:${type}:base`,
    source: unitSource(filename),
    target: { maxDimension: TILE_SIZE },
    anchors: type === 'rocketTank'
      ? { center: [0.5, 0.5], muzzleSource: [42, 10] }
      : { center: [0.5, 0.5] },
    states: type === 'harvester' ? ['idle', 'harvesting'] : ['base']
  })),
  {
    id: 'unit:howitzer:base',
    source: unitSource('howitzer_map.webp'),
    target: { maxDimension: TILE_SIZE },
    anchors: { center: [0.5, 0.5], barrelMountSource: [30, 30] },
    states: ['base']
  },
  {
    id: 'unit:howitzer:barrel',
    source: unitSource('tankV1_barrel.webp'),
    target: { reference: unitSource('howitzer_map.webp'), maxDimension: TILE_SIZE },
    anchors: { mountSource: [2, 0], muzzleSource: [2, 64] },
    states: ['base', 'recoil']
  },
  ...[
    ['destroyer', 'destroyer_map.webp', 3.9],
    ['supplyShip', 'supply_ship_map.webp', 3.3],
    ['hovercraft', 'hovercraft_map.webp', 3.3],
    ['vehicleFerry', 'vehicle_ferry_map.webp', 4.8],
    ['aircraftCarrier', 'aircraft_carrier_map.webp', 9.36],
    ['navalMineLayer', 'naval_mine_layer_map.webp', 4.05],
    ['battleship', 'battleship_map.webp', 6.6],
    ['submarine', 'submarine_map.webp', 2.8]
  ].map(([type, filename, tiles]) => ({
    id: `naval:${type}:hull`,
    source: unitSource(filename),
    target: { maxDimension: TILE_SIZE * tiles },
    anchors: type === 'destroyer'
      ? { center: [0.5, 0.5], gunSource: [55, 260] }
      : { center: [0.5, 0.5] },
    states: type === 'submarine'
      ? ['surfaced', 'surfacing-clip', 'submerging-clip', 'submerged']
      : ['base']
  })),
  {
    id: 'naval:battleship:turret',
    source: unitSource('battleship_turret.webp'),
    target: { width: TILE_SIZE * 0.78 * 0.7, height: TILE_SIZE * 0.78 * 0.7 },
    anchors: { center: [0.5, 0.5] },
    states: ['base']
  },
  {
    id: 'naval:battleship:barrel',
    source: unitSource('battleship_barrel.webp'),
    target: { height: TILE_SIZE * 1.02 * 0.7, preserveAspect: true },
    anchors: { center: [0.5, 0.5], muzzle: [0.5, 0.96] },
    states: ['base', 'recoil']
  },
  {
    id: 'aircraft:apache:rotor',
    source: unitSource('apache_rotor_map.webp'),
    target: { width: TILE_SIZE * 1.5, preserveAspect: true },
    anchors: { rotorSource: [31, 30] },
    states: ['rotating']
  },
  ...[
    ['f22', 'f22_raptor_map.webp', TILE_SIZE * 1.4, { rocketSource: [32, 39.68] }],
    ['f35', 'f35_map.webp', TILE_SIZE * 1.32, { bombSource: [32, 35.2] }]
  ].flatMap(([type, filename, flightWidth, anchors]) => [
    {
      id: `aircraft:${type}:ground`,
      source: unitSource(filename),
      target: { width: flightWidth * 0.75, preserveAspect: true },
      anchors: { center: [0.5, 0.5], ...anchors },
      states: ['grounded', 'taxi']
    },
    {
      id: `aircraft:${type}:flight`,
      source: unitSource(filename),
      target: { width: flightWidth, preserveAspect: true },
      anchors: { center: [0.5, 0.5], ...anchors },
      states: ['airborne', 'takeoff-resize', 'landing-resize']
    }
  ]),
  ...[
    ['powerPlant', 'power_plant.webp', 3, 3],
    ['oreRefinery', 'refinery.webp', 3, 3],
    ['vehicleFactory', 'vehicle_factory.webp', 3, 3],
    ['vehicleWorkshop', 'vehicle_workshop.webp', 3, 3],
    ['constructionYard', 'construction_yard.webp', 3, 3],
    ['radarStation', 'radar_station.webp', 2, 2],
    ['hospital', 'hospital.webp', 3, 3],
    ['helipad', 'helipad_map.webp', 2, 2],
    ['airstrip', 'airstrip_map.webp', 12, 6],
    ['shipyard', 'shipyard_map.webp', 5, 5],
    ['gasStation', 'gas_station.webp', 3, 3],
    ['ammunitionFactory', 'ammunition_factory_map.webp', 3, 3],
    ['turretGunV1', 'turret01_base.webp', 1, 1],
    ['turretGunV2', 'turret02_base.webp', 1, 1],
    ['turretGunV3', 'turret03_base.webp', 1, 1],
    ['rocketTurret', 'rocket_gun.webp', 2, 2],
    ['teslaCoil', 'teslacoil.webp', 2, 2],
    ['artilleryTurret', 'artillery_turret.webp', 2, 2],
    ['concreteWallCross', 'concrete_wall_cross.webp', 1, 1],
    ['concreteWallHorizontal', 'concrete_wall_horizontal.webp', 1, 1],
    ['concreteWallVertical', 'concrete_wall_vertical.webp', 1, 1],
    ['mineClearance', 'mineclearance_map.webp', 1, 1],
    ['technologyResearchCenter', 'technology_research_center_map.webp', 3, 3]
  ].map(([type, filename, widthTiles, heightTiles]) => ({
    id: `building:${type}:base`,
    source: buildingSource(filename),
    target: { width: widthTiles * TILE_SIZE, height: heightTiles * TILE_SIZE },
    anchors: { topLeft: [0, 0], center: [0.5, 0.5] },
    states: type === 'teslaCoil'
      ? ['base', 'charging-clip', 'firing']
      : ['base', 'construction-clip', 'selling-clip']
  })),
  ...['turretGunV1', 'turretGunV2', 'turretGunV3'].map((type, index) => ({
    id: `building:${type}:top`,
    source: buildingSource(`turret0${index + 1}_top.webp`),
    target: { width: TILE_SIZE, height: TILE_SIZE },
    anchors: { center: [0.5, 0.5] },
    states: ['base', 'rotating', 'firing']
  }))
]

function absolutePublicPath(publicPath) {
  return path.join(ROOT, 'public', publicPath)
}

function densityName(density) {
  return Number.isInteger(density) ? String(density) : String(density).replace('.', '_')
}

function outputName(id, density) {
  return `${id.replaceAll(':', '/') }@${densityName(density)}x.webp`
}

function roundBacking(value, density) {
  return Math.max(1, Math.round(value * density))
}

async function inspectSources() {
  const sourcePaths = [...new Set(definitions.flatMap(definition => [
    definition.source,
    definition.target.reference
  ].filter(Boolean)).concat([
    unitSource('apache_body_map.webp')
  ]))].sort()
  const result = new Map()
  for (const source of sourcePaths) {
    const file = absolutePublicPath(source)
    const [metadata, contents] = await Promise.all([sharp(file).metadata(), readFile(file)])
    result.set(source, {
      width: metadata.width,
      height: metadata.height,
      hasAlpha: Boolean(metadata.hasAlpha),
      sha256: createHash('sha256').update(contents).digest('hex')
    })
  }
  return result
}

function resolveLogicalSize(definition, sourceInventory) {
  const source = sourceInventory.get(definition.source)
  const target = definition.target
  if (target.reference) {
    const reference = sourceInventory.get(target.reference)
    const scale = target.maxDimension / Math.max(reference.width, reference.height)
    return { width: source.width * scale, height: source.height * scale }
  }
  if (target.maxDimension) {
    const scale = target.maxDimension / Math.max(source.width, source.height)
    return { width: source.width * scale, height: source.height * scale }
  }
  if (target.preserveAspect && target.width) {
    return { width: target.width, height: source.height * (target.width / source.width) }
  }
  if (target.preserveAspect && target.height) {
    return { width: source.width * (target.height / source.height), height: target.height }
  }
  return { width: target.width, height: target.height }
}

function resolveAnchors(definition, sourceInventory, logicalSize) {
  const source = sourceInventory.get(definition.source)
  const scaleX = logicalSize.width / source.width
  const scaleY = logicalSize.height / source.height
  return Object.fromEntries(Object.entries(definition.anchors || {}).map(([name, value]) => {
    if (name.endsWith('Source')) {
      return [name.slice(0, -6), {
        x: value[0] * scaleX,
        y: value[1] * scaleY,
        sourceX: value[0],
        sourceY: value[1]
      }]
    }
    return [name, { x: value[0] * logicalSize.width, y: value[1] * logicalSize.height }]
  }))
}

async function buildSpriteVariant(definition, logicalSize, density) {
  const width = roundBacking(logicalSize.width, density)
  const height = roundBacking(logicalSize.height, density)
  const relativeOutput = outputName(definition.id, density)
  const output = path.join(OUTPUT_ROOT, relativeOutput)
  await mkdir(path.dirname(output), { recursive: true })
  await sharp(absolutePublicPath(definition.source))
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: WEBP_QUALITY, alphaQuality: WEBP_QUALITY, effort: 6 })
    .toFile(output)
  return {
    density,
    path: `/images/prepared/${relativeOutput}`,
    backingWidth: width,
    backingHeight: height,
    decodedBytes: width * height * 4
  }
}

function apacheTilt(tiltState) {
  switch (tiltState) {
    case 'forward': return { scaleX: 1, scaleY: 0.9, offsetY: TILE_SIZE * 0.08 }
    case 'backward': return { scaleX: 1, scaleY: 0.9, offsetY: -TILE_SIZE * 0.08 }
    case 'left':
    case 'right': return { scaleX: 0.9, scaleY: 1, offsetY: 0 }
    default: return { scaleX: 1, scaleY: 1, offsetY: 0 }
  }
}

async function buildApacheAtlas(density) {
  const cell = roundBacking(TILE_SIZE, density)
  const atlasWidth = cell * APACHE_BUCKET_DEGREES.length
  const atlasHeight = cell * APACHE_TILT_STATES.length
  const composites = []
  const source = absolutePublicPath(unitSource('apache_body_map.webp'))
  const sourceMetadata = await sharp(source).metadata()
  const bodyScale = (TILE_SIZE * 0.7 * 1.5 * density) / sourceMetadata.width
  const bodyWidth = Math.max(1, Math.round(sourceMetadata.width * bodyScale))
  const bodyHeight = Math.max(1, Math.round(sourceMetadata.height * bodyScale))

  for (let row = 0; row < APACHE_TILT_STATES.length; row++) {
    const tilt = apacheTilt(APACHE_TILT_STATES[row])
    const tiltedWidth = Math.max(1, Math.round(bodyWidth * tilt.scaleX))
    const tiltedHeight = Math.max(1, Math.round(bodyHeight * tilt.scaleY))
    const body = await sharp(source)
      .resize(tiltedWidth, tiltedHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer()
    const localSize = Math.max(cell * 3, Math.ceil(Math.hypot(bodyWidth, bodyHeight)) + cell)
    const bodyLeft = Math.round((localSize - tiltedWidth) / 2)
    const bodyTop = Math.round((localSize - tiltedHeight) / 2 + tilt.offsetY * density)
    const local = await sharp({
      create: { width: localSize, height: localSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: body, left: bodyLeft, top: bodyTop }])
      .png()
      .toBuffer()

    for (let column = 0; column < APACHE_BUCKET_DEGREES.length; column++) {
      const angle = APACHE_BUCKET_DEGREES[column] + 90
      const rotated = await sharp(local)
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      const rotatedMetadata = await sharp(rotated).metadata()
      const extracted = await sharp(rotated)
        .extract({
          left: Math.floor((rotatedMetadata.width - cell) / 2),
          top: Math.floor((rotatedMetadata.height - cell) / 2),
          width: cell,
          height: cell
        })
        .png()
        .toBuffer()
      composites.push({ input: extracted, left: column * cell, top: row * cell })
    }
  }

  const relativeOutput = `aircraft/apache/body-atlas@${densityName(density)}x.webp`
  const output = path.join(OUTPUT_ROOT, relativeOutput)
  await mkdir(path.dirname(output), { recursive: true })
  await sharp({
    create: { width: atlasWidth, height: atlasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite(composites)
    .webp({ quality: WEBP_QUALITY, alphaQuality: WEBP_QUALITY, effort: 6 })
    .toFile(output)
  return {
    density,
    path: `/images/prepared/${relativeOutput}`,
    backingWidth: atlasWidth,
    backingHeight: atlasHeight,
    cellWidth: cell,
    cellHeight: cell,
    decodedBytes: atlasWidth * atlasHeight * 4
  }
}

async function main() {
  const sourceInventory = await inspectSources()
  const versionHash = createHash('sha256')
  versionHash.update(JSON.stringify({ definitions, densities: DENSITIES, quality: WEBP_QUALITY }))
  for (const [source, metadata] of sourceInventory) versionHash.update(`${source}:${metadata.sha256}`)
  const assetVersion = versionHash.digest('hex').slice(0, 16)

  await rm(OUTPUT_ROOT, { recursive: true, force: true })
  await mkdir(OUTPUT_ROOT, { recursive: true })

  const entries = []
  for (const definition of definitions) {
    const source = sourceInventory.get(definition.source)
    const logicalSize = resolveLogicalSize(definition, sourceInventory)
    const variants = []
    for (const density of DENSITIES) {
      variants.push(await buildSpriteVariant(definition, logicalSize, density))
    }
    entries.push({
      id: definition.id,
      category: definition.id.split(':', 1)[0],
      source: `/${definition.source}`,
      sourceWidth: source.width,
      sourceHeight: source.height,
      logicalWidth: logicalSize.width,
      logicalHeight: logicalSize.height,
      hasAlpha: source.hasAlpha,
      alphaMode: 'straight',
      anchorSpace: 'logical-pixels',
      anchors: resolveAnchors(definition, sourceInventory, logicalSize),
      states: definition.states,
      variants
    })
  }

  const apacheAtlases = []
  for (const density of DENSITIES) apacheAtlases.push(await buildApacheAtlas(density))
  for (let row = 0; row < APACHE_TILT_STATES.length; row++) {
    for (let column = 0; column < APACHE_BUCKET_DEGREES.length; column++) {
      entries.push({
        id: `aircraft:apache:body:${APACHE_BUCKET_DEGREES[column]}:${APACHE_TILT_STATES[row]}`,
        category: 'aircraft',
        source: `/${unitSource('apache_body_map.webp')}`,
        sourceWidth: 64,
        sourceHeight: 64,
        logicalWidth: TILE_SIZE,
        logicalHeight: TILE_SIZE,
        hasAlpha: true,
        alphaMode: 'straight',
        anchorSpace: 'logical-pixels',
        anchors: { center: { x: TILE_SIZE / 2, y: TILE_SIZE / 2 } },
        states: [APACHE_TILT_STATES[row]],
        variants: apacheAtlases.map(atlas => ({
          density: atlas.density,
          path: atlas.path,
          backingWidth: atlas.cellWidth,
          backingHeight: atlas.cellHeight,
          decodedBytes: atlas.cellWidth * atlas.cellHeight * 4,
          sourceRect: {
            x: column * atlas.cellWidth,
            y: row * atlas.cellHeight,
            width: atlas.cellWidth,
            height: atlas.cellHeight
          }
        }))
      })
    }
  }

  entries.sort((left, right) => left.id.localeCompare(right.id))
  const manifest = {
    schemaVersion: 1,
    assetVersion,
    generatedBy: 'scripts/build-prepared-sprites.mjs',
    webpQuality: WEBP_QUALITY,
    densities: DENSITIES,
    inventory: {
      entryCount: entries.length,
      sourceCount: sourceInventory.size,
      generatedVariantCount: entries.reduce((sum, entry) => sum + entry.variants.length, 0),
      decodedVariantBytes: entries.reduce((sum, entry) =>
        sum + entry.variants.reduce((variantSum, variant) => variantSum + variant.decodedBytes, 0), 0)
    },
    entries
  }
  await writeFile(path.join(OUTPUT_ROOT, 'sprite-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`Prepared ${manifest.inventory.generatedVariantCount} variants (${entries.length} entries), version ${assetVersion}\n`)
}

await main()
