import { UNIT_COSTS } from '../config.js'
import { buildingData } from '../data/buildingData.js'

const FULL_BUILDING_TECH_TREE = [
  { type: 'constructionYard', req: '-' },
  { type: 'powerPlant', req: '-' },
  { type: 'oreRefinery', req: '-' },
  { type: 'vehicleFactory', req: '-' },
  { type: 'vehicleWorkshop', req: '-' },
  { type: 'radarStation', req: '-' },
  { type: 'hospital', req: '-' },
  { type: 'helipad', req: '-' },
  { type: 'gasStation', req: '-' },
  { type: 'turretGunV1', req: '-' },
  { type: 'concreteWall', req: '-' },
  { type: 'ammunitionFactory', req: 'vehicleFactory' },
  { type: 'turretGunV2', req: 'radarStation' },
  { type: 'turretGunV3', req: 'radarStation' },
  { type: 'rocketTurret', req: 'radarStation' },
  { type: 'teslaCoil', req: 'radarStation' },
  { type: 'artilleryTurret', req: 'radarStation' }
]

const FULL_UNIT_TECH_TREE = [
  { type: 'tank', req: 'vehicleFactory', spawn: 'vehicleFactory' },
  { type: 'tank_v1', req: 'vehicleFactory', spawn: 'vehicleFactory' },
  { type: 'harvester', req: 'vehicleFactory+oreRefinery', spawn: 'vehicleFactory' },
  { type: 'tankerTruck', req: 'vehicleFactory+gasStation', spawn: 'vehicleFactory' },
  { type: 'ammunitionTruck', req: 'vehicleFactory+ammunitionFactory', spawn: 'vehicleFactory' },
  { type: 'ambulance', req: 'hospital', spawn: 'vehicleFactory' },
  { type: 'recoveryTank', req: 'vehicleFactory+vehicleWorkshop', spawn: 'vehicleFactory' },
  { type: 'mineSweeper', req: 'vehicleFactory+vehicleWorkshop', spawn: 'vehicleFactory' },
  { type: 'mineLayer', req: 'vehicleFactory+vehicleWorkshop+ammunitionFactory', spawn: 'vehicleFactory' },
  { type: 'apache', req: 'helipad', spawn: 'helipad' },
  { type: 'tank-v3', req: '2xvehicleFactory', spawn: 'vehicleFactory' },
  { type: 'rocketTank', req: 'rocketTurret', spawn: 'vehicleFactory' },
  { type: 'tank-v2', req: 'radarStation', spawn: 'vehicleFactory' },
  { type: 'howitzer', req: 'vehicleFactory+radarStation+artilleryTurret', spawn: 'vehicleFactory' }
]

function buildCompactTechTreeLine(kind, type, cost, req, extra) {
  return [kind, type, cost, req || '', extra || ''].join(',')
}

const FULL_TECH_TREE_CSV = [
  'fmt:k,type,cost,req,extra',
  ...FULL_BUILDING_TECH_TREE.map(entry => buildCompactTechTreeLine(
    'B',
    entry.type,
    Number(buildingData[entry.type]?.cost || 0),
    entry.req,
    ''
  )),
  ...FULL_UNIT_TECH_TREE.map(entry => buildCompactTechTreeLine(
    'U',
    entry.type,
    Number(UNIT_COSTS[entry.type] || 0),
    entry.req,
    entry.spawn === 'vehicleFactory' ? '' : entry.spawn
  ))
].join('\n')

/**
 * Compute the set of building types available to a given owner based on tech tree.
 * Mirrors the logic in productionControllerTechTree.syncTechTreeWithBuildings.
 */
export function computeAvailableBuildingTypes(buildings, factories, owner) {
  const available = new Set([
    'constructionYard', 'oreRefinery', 'powerPlant', 'vehicleFactory',
    'vehicleWorkshop', 'radarStation', 'hospital', 'helipad',
    'gasStation', 'turretGunV1', 'concreteWall'
  ])
  const owned = [...buildings, ...factories].filter(building => building.owner === owner && building.health > 0)
  const hasRadar = owned.some(building => building.type === 'radarStation')
  const hasFactory = owned.some(building => building.type === 'vehicleFactory')
  if (hasFactory) available.add('ammunitionFactory')
  if (hasRadar) {
    available.add('turretGunV2')
    available.add('turretGunV3')
    available.add('rocketTurret')
    available.add('teslaCoil')
    available.add('artilleryTurret')
  }
  return available
}

/**
 * Compute the set of unit types available to a given owner based on tech tree.
 * Mirrors the logic in productionControllerTechTree.syncTechTreeWithBuildings.
 */
export function computeAvailableUnitTypes(buildings, factories, owner) {
  const available = new Set()
  const owned = [...buildings, ...factories].filter(building => building.owner === owner && building.health > 0)
  const hasFactory = owned.some(building => building.type === 'vehicleFactory')
  const hasRefinery = owned.some(building => building.type === 'oreRefinery')
  const hasGasStation = owned.some(building => building.type === 'gasStation')
  const hasHospital = owned.some(building => building.type === 'hospital')
  const hasWorkshop = owned.some(building => building.type === 'vehicleWorkshop')
  const hasAmmunitionFactory = owned.some(building => building.type === 'ammunitionFactory')
  const hasHelipad = owned.some(building => building.type === 'helipad')
  const hasRocketTurret = owned.some(building => building.type === 'rocketTurret')
  const hasArtilleryTurret = owned.some(building => building.type === 'artilleryTurret')
  const hasRadar = owned.some(building => building.type === 'radarStation')
  const factoryCount = owned.filter(building => building.type === 'vehicleFactory').length
  if (hasFactory) {
    available.add('tank')
    available.add('tank_v1')
  }
  if (hasFactory && hasRefinery) available.add('harvester')
  if (hasFactory && hasGasStation) available.add('tankerTruck')
  if (hasFactory && hasAmmunitionFactory) available.add('ammunitionTruck')
  if (hasHospital) available.add('ambulance')
  if (hasFactory && hasWorkshop) {
    available.add('recoveryTank')
    available.add('mineSweeper')
  }
  if (hasFactory && hasWorkshop && hasAmmunitionFactory) available.add('mineLayer')
  if (hasHelipad) available.add('apache')
  if (factoryCount >= 2) available.add('tank-v3')
  if (hasRocketTurret) available.add('rocketTank')
  if (hasRadar) {
    available.add('tank-v2')
    if (hasFactory && hasArtilleryTurret) available.add('howitzer')
  }
  return available
}

export function buildCompactTechTreeCsv() {
  return FULL_TECH_TREE_CSV
}
