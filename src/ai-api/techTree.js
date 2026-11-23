import { AIRCRAFT_TYPES, hasPlaneFactory } from '../production/aircraftProduction.js'
import { advancedBuildingTypes, getAdvancedBuildingRequirement } from '../production/advancedBuildingAccess.js'
import { UNIT_COSTS } from '../config.js'
import { hasResearchCenterPrerequisites } from '../production/researchCenterRequirements.js'
import { buildingData } from '../data/buildingData.js'

const FULL_BUILDING_TECH_TREE = [
  { type: 'constructionYard', req: '-' },
  { type: 'powerPlant', req: '-' },
  { type: 'oreRefinery', req: '-' },
  { type: 'vehicleFactory', req: '-' },
  { type: 'fireDepartment', req: 'vehicleWorkshop' },
  { type: 'vehicleWorkshop', req: '-' },
  { type: 'radarStation', req: '-' },
  { type: 'commandCenter', req: 'radarStation' },
  { type: 'technologyResearchCenter', req: 'radarStation+commandCenter' },
  { type: 'hospital', req: '-' },
  { type: 'helipad', req: '-' },
  { type: 'shipyard', req: 'radarStation+vehicleFactory' },
  { type: 'airstrip', req: 'radarStation' },
  { type: 'planeFactory', req: 'helipad|airstrip' },
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
  { type: 'fireEngine', req: 'vehicleFactory+fireDepartment', spawn: 'vehicleFactory' },
  { type: 'tankerTruck', req: 'vehicleFactory+gasStation', spawn: 'vehicleFactory' },
  { type: 'ammunitionTruck', req: 'vehicleFactory+ammunitionFactory', spawn: 'vehicleFactory' },
  { type: 'ambulance', req: 'hospital', spawn: 'vehicleFactory' },
  { type: 'recoveryTank', req: 'vehicleFactory+vehicleWorkshop', spawn: 'vehicleFactory' },
  { type: 'mineSweeper', req: 'vehicleFactory+vehicleWorkshop', spawn: 'vehicleFactory' },
  { type: 'mineLayer', req: 'vehicleFactory+vehicleWorkshop+ammunitionFactory', spawn: 'vehicleFactory' },
  ...AIRCRAFT_TYPES.map(type => ({ type, req: 'planeFactory', spawn: 'planeFactory' })),
  { type: 'destroyer', req: 'shipyard', spawn: 'shipyard' },
  { type: 'hovercraft', req: 'shipyard', spawn: 'shipyard' },
  { type: 'vehicleFerry', req: 'shipyard', spawn: 'shipyard' },
  { type: 'aircraftCarrier', req: 'shipyard', spawn: 'shipyard' },
  { type: 'navalMineLayer', req: 'shipyard', spawn: 'shipyard' },
  { type: 'battleship', req: 'shipyard', spawn: 'shipyard' },
  { type: 'submarine', req: 'shipyard', spawn: 'shipyard' },
  { type: 'tank-v3', req: '2xvehicleFactory', spawn: 'vehicleFactory' },
  { type: 'lightTank', req: 'vehicleFactory', spawn: 'vehicleFactory' },
  { type: 'rocketTank', req: 'rocketTurret', spawn: 'vehicleFactory' },
  { type: 'tank-v2', req: 'radarStation', spawn: 'vehicleFactory' },
  { type: 'howitzer', req: 'vehicleFactory+radarStation+artilleryTurret', spawn: 'vehicleFactory' }
]

function buildCompactTechTreeLine(kind, type, cost, req, extra) {
  const fields = [kind, type, cost, req || '']
  if (extra) fields.push(extra)
  return fields.join(',')
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
    entry.spawn === 'vehicleFactory' || entry.spawn === entry.req ? '' : entry.spawn
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
  if (owned.some(building => ['helipad', 'airstrip'].includes(building.type))) available.add('planeFactory')
  if (owned.some(building => building.type === 'vehicleWorkshop')) available.add('fireDepartment')
  if (hasRadar) {
    available.add('commandCenter')
    if (hasResearchCenterPrerequisites(owned, owner)) available.add('technologyResearchCenter')
    available.add('turretGunV2')
    available.add('turretGunV3')
    available.add('rocketTurret')
    available.add('teslaCoil')
    available.add('artilleryTurret')
    available.add('airstrip')
    if (hasFactory) available.add('shipyard')
  }
  for (const type of advancedBuildingTypes) {
    if (!getAdvancedBuildingRequirement(type, owned, owner)) available.add(type)
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
  const hasShipyard = owned.some(building => building.type === 'shipyard')
  const hasRocketTurret = owned.some(building => building.type === 'rocketTurret')
  const hasArtilleryTurret = owned.some(building => building.type === 'artilleryTurret')
  const hasRadar = owned.some(building => building.type === 'radarStation')
  const factoryCount = owned.filter(building => building.type === 'vehicleFactory').length
  if (hasFactory) {
    available.add('tank')
    available.add('tank_v1')
    available.add('lightTank')
  }
  if (hasFactory && hasRefinery) available.add('harvester')
  if (hasFactory && owned.some(building => building.type === 'fireDepartment')) available.add('fireEngine')
  if (hasFactory && hasGasStation) available.add('tankerTruck')
  if (hasFactory && hasAmmunitionFactory) available.add('ammunitionTruck')
  if (hasHospital) available.add('ambulance')
  if (hasFactory && hasWorkshop) {
    available.add('recoveryTank')
    available.add('mineSweeper')
  }
  if (hasFactory && hasWorkshop && hasAmmunitionFactory) available.add('mineLayer')
  if (hasPlaneFactory(owned, owner)) AIRCRAFT_TYPES.forEach(type => available.add(type))
  if (hasShipyard) {
    ;['destroyer', 'hovercraft', 'vehicleFerry', 'aircraftCarrier', 'navalMineLayer', 'battleship', 'submarine']
      .forEach(type => available.add(type))
  }
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
