export const CAPSTONE_PERK_ID = 'cc.def.capstone'
export const START_PERK_BY_VARIANT = Object.freeze({ unit: 'cc.unit.start', defence: 'cc.def.start', build: 'cc.base.start', unitBuild: 'cc.prod.start' })

const laneEnds = ['cc.unit.if.sensing', 'cc.unit.do.air', 'cc.def.if.world', 'cc.def.do.manual', 'cc.base.if.enemies', 'cc.base.do.defence', 'cc.prod.if.enemies', 'cc.prod.do.naval']
const definitions = [
  ['cc.unit.start','Unit Command Link','unit','unit','start',0,5,[],[],[]],
  ['cc.unit.if.own','Self Diagnostics','unit','unit','if',1,0,['cc.unit.start'],['hp','xp','rank','fuel','ammo','reload','crew','load','rotation','turretRotation','airborne','moving','attacking','serving','always'],[],[]],
  ['cc.unit.if.world','Battlefield Awareness','unit','unit','if',2,2,['cc.unit.if.own'],['money','power','buildingCount','onFire','underService','underServiceByUnit','inServiceRange','protectedByUnit','inDefenseRange','canAttack','inVisibleRange','parkedAt','hitDirect','hitIndirect','underAttackBy','underFire'],[],[]],
  ['cc.unit.if.sensing','Threat Sensors','unit','unit','if',3,3,['cc.unit.if.world'],['distance','enemyVisible','enemyInFireRange','myUnitsInEnemyRange','enemyInRange','enemyDistance'],[],[]],
  ['cc.unit.do.service','Logistics Protocols','unit','unit','do',1,0,['cc.unit.start'],[],['requestRefill','goToWorkshop','goToHospital','goToAmmoFactory','serviceNearestFriendly'],[]],
  ['cc.unit.do.combat','Combat Doctrine','unit','unit','do',2,3,['cc.unit.do.service'],[],['attackNearestEnemy','autoAttackInRange','aimNearestEnemy','fireAtLocked','fireForward','turretLeft','turretRight','protectNearestFriendly'],[]],
  ['cc.unit.do.movement','Maneuver Drills','unit','unit','do',3,2,['cc.unit.do.combat'],[],['hold','retreat','moveForward','moveBackward','moveLeft','moveRight','turnLeft','turnRight'],[]],
  ['cc.unit.do.air','Flight Control','unit','unit','do',4,1,['cc.unit.do.movement'],[],['takeoff','land'],[]],
  ['cc.def.start','Defence Grid Uplink','def','defence','start',0,2,[],[],[]],
  ['cc.def.if.sensing','Perimeter Sensors','def','defence','if',1,0,['cc.def.start'],['distance','enemyVisible','enemyInFireRange','enemyInRange','enemyDistance'],[],[]],
  ['cc.def.if.own','Turret Telemetry','def','defence','if',2,1,['cc.def.if.sensing'],['hp','ammo','reload','turretRotation','attacking','always'],[],[]],
  ['cc.def.if.world','Grid Status','def','defence','if',3,1,['cc.def.if.own'],['money','power','buildingCount','onFire','canAttack','underFire'],[],[]],
  ['cc.def.do.discipline','Fire Discipline','def','defence','do',1,0,['cc.def.start'],[],['holdFire','resumeFire'],[]],
  ['cc.def.do.engage','Engagement Rules','def','defence','do',2,1,['cc.def.do.discipline'],[],['autoAttackInRange'],[]],
  ['cc.def.do.lock','Target Lock','def','defence','do',3,2,['cc.def.do.engage'],[],['aimNearestEnemy','fireAtLocked'],[]],
  ['cc.def.do.manual','Manual Gunnery','def','defence','do',4,2,['cc.def.do.lock'],[],['turretLeft','turretRight','fireForward'],[]],
  ['cc.base.start','Base Planner','base','build','start',0,2,[],[],[]],
  ['cc.base.if.economy','Treasury Feed','base','build','if',1,0,['cc.base.start'],['money','moneyPerMinute','power','always'],[],[]],
  ['cc.base.if.census','Base Census','base','build','if',2,1,['cc.base.if.economy'],['unitCount','buildingCount','burningBuildingCount'],[],[]],
  ['cc.base.if.enemies','Recon Uplink','base','build','if',3,2,['cc.base.if.census'],['enemyUnitCount','enemyBuildingCount'],[],[]],
  ['cc.base.do.economy','Economy Blueprints','base','build','do',1,0,['cc.base.start'],[],[],[['buildBuilding','buildingType',['powerPlant','oreRefinery','concreteWall']]]],
  ['cc.base.do.support','Support Blueprints','base','build','do',2,1,['cc.base.do.economy'],[],[],[['buildBuilding','buildingType',['vehicleWorkshop','fireDepartment','hospital','gasStation','ammunitionFactory','radarStation','commandCenter']]]],
  ['cc.base.do.production','Production Blueprints','base','build','do',3,2,['cc.base.do.support'],[],[],[['buildBuilding','buildingType',['vehicleFactory','helipad','airstrip','constructionYard']]]],
  ['cc.base.do.defence','Fortification Blueprints','base','build','do',4,3,['cc.base.do.production'],[],[],[['buildBuilding','buildingType',['turretGunV1','turretGunV2','turretGunV3','rocketTurret','teslaCoil','artilleryTurret']]]],
  ['cc.prod.start','Production Scheduler','prod','unitBuild','start',0,3,[],[],[]],
  ['cc.prod.if.economy','Treasury Feed','prod','unitBuild','if',1,0,['cc.prod.start'],['money','moneyPerMinute','power','always'],[],[]],
  ['cc.prod.if.census','Force Census','prod','unitBuild','if',2,1,['cc.prod.if.economy'],['unitCount','buildingCount','burningBuildingCount'],[],[]],
  ['cc.prod.if.losses','Casualty Reports','prod','unitBuild','if',3,2,['cc.prod.if.census'],['ownUnitDestroyed'],[],[]],
  ['cc.prod.if.enemies','Recon Uplink','prod','unitBuild','if',4,2,['cc.prod.if.losses'],['enemyUnitCount','enemyBuildingCount'],[],[]],
  ['cc.prod.do.ground','Armour Line','prod','unitBuild','do',1,0,['cc.prod.start'],[],[],[['buildUnits','unitType',['tank','tank-v2','tank-v3','lightTank','rocketTank','howitzer','harvester']],['buildUnits','delivery',['factoryRally']]]],
  ['cc.prod.do.support','Support Fleet','prod','unitBuild','do',2,1,['cc.prod.do.ground'],[],[],[['buildUnits','unitType',['fireEngine','ambulance','tankerTruck','ammunitionTruck','recoveryTank','mineLayer','mineSweeper']]]],
  ['cc.prod.do.orders','Deployment Orders','prod','unitBuild','do',3,2,['cc.prod.do.support'],[],[],[['buildUnits','delivery',['attackNearest','attackHarvester','attackBase','defendHarvester','defendBase']]]],
  ['cc.prod.do.air','Air Wing','prod','unitBuild','do',4,2,['cc.prod.do.orders'],[],[],[['buildUnits','unitType',['apache','f22Raptor','f35']]]],
  ['cc.prod.do.naval','Naval Yard','prod','unitBuild','do',5,2,['cc.prod.do.air'],[],[],[['buildUnits','unitType',['destroyer','battleship','submarine','aircraftCarrier','supplyShip','hovercraft','vehicleFerry','navalMineLayer']]]],
  [CAPSTONE_PERK_ID,'Turret Veterancy','def','defence','capstone',5,5,null,[],[],[]]
]

const PERK_TEXTS = Object.freeze({
  'cc.unit.start': {
    'summary': 'Opens the control-unit automation type: write automations for single units and apply them to your units.',
    'howTo': 'Buy it, then add a "control unit" automation in the Automations panel. Starter combo: if fuel < 20% → go to workshop / request refill.'
  },
  'cc.unit.if.own': {
    'summary': 'Own-unit conditions: health, XP, rank, fuel, ammo, reload, crew, load, rotation, airborne, moving, attacking, serving.',
    'howTo': 'Use them in IF/WHILE/AFTER, e.g. IF hp < 30%.'
  },
  'cc.unit.if.world': {
    'summary': 'World conditions: money, power, building count, fire, service and protection state, defence range, visibility, parking and incoming hits.',
    'howTo': 'E.g. IF underFire → retreat.'
  },
  'cc.unit.if.sensing': {
    'summary': 'Sensing conditions: distances, enemy visibility, enemies in fire range and enemy distance.',
    'howTo': 'E.g. IF enemyInFireRange → attackNearestEnemy.'
  },
  'cc.unit.do.service': {
    'summary': 'Service actions: request refill and go to workshop, hospital or ammo factory, or service the nearest friendly unit.',
    'howTo': 'E.g. IF ammo < 20% DO goToAmmoFactory.'
  },
  'cc.unit.do.combat': {
    'summary': 'Combat actions: attack nearest enemy, auto-attack in range, aim, fire at locked target, fire forward, turn turret, protect a friendly unit.',
    'howTo': 'E.g. IF enemyVisible DO attackNearestEnemy.'
  },
  'cc.unit.do.movement': {
    'summary': 'Movement actions: hold, retreat, move forward/back/left/right and turn.',
    'howTo': 'E.g. IF hp < 25% DO retreat.'
  },
  'cc.unit.do.air': {
    'summary': 'Air actions: take off and land.',
    'howTo': 'E.g. IF fuel < 15% DO land.'
  },
  'cc.def.start': {
    'summary': 'Opens the base-defence automation type: write automations for turrets and apply them.',
    'howTo': 'Buy it, then add a "control base defence" automation and apply it to a turret.'
  },
  'cc.def.if.sensing': {
    'summary': 'Sensing conditions for turrets: distances, enemy visibility, enemies in fire range and enemy distance.',
    'howTo': 'Ambush: hold fire WHILE NOT enemyInFireRange, then resume fire.'
  },
  'cc.def.if.own': {
    'summary': 'Turret telemetry conditions: health, ammo, reload, turret rotation and attacking state.',
    'howTo': 'E.g. IF reload > 0 DO holdFire.'
  },
  'cc.def.if.world': {
    'summary': 'Grid status conditions: money, power, building count, fire, can attack, under fire.',
    'howTo': 'E.g. IF power < 0 DO holdFire.'
  },
  'cc.def.do.discipline': {
    'summary': 'Fire discipline actions: hold fire and resume fire.',
    'howTo': 'Combine with sensing for an ambush.'
  },
  'cc.def.do.engage': {
    'summary': 'Engagement rule: auto-attack enemies in range.',
    'howTo': 'E.g. IF enemyInRange DO autoAttackInRange.'
  },
  'cc.def.do.lock': {
    'summary': 'Target lock actions: aim at the nearest enemy and fire at the locked target.',
    'howTo': 'E.g. aimNearestEnemy, then fireAtLocked.'
  },
  'cc.def.do.manual': {
    'summary': 'Manual gunnery actions: turn turret left or right and fire forward.',
    'howTo': 'Script sweep patterns with turretLeft / turretRight / fireForward.'
  },
  'cc.def.capstone': {
    'summary': 'Turret Veterancy: defence buildings earn XP and stars (range, fire rate, armor and self repair) and their stars count toward your ledger.',
    'howTo': 'Unlocks once any IF or DO lane is complete. Turrets start earning from 0 XP after purchase.'
  },
  'cc.base.start': {
    'summary': 'Opens the base-build automation type and the "Base automation" opt-in switch.',
    'howTo': 'Starter combo: WHILE power < 0 → build power plant.'
  },
  'cc.base.if.economy': {
    'summary': 'Treasury feed conditions: money, money per minute and power.',
    'howTo': 'E.g. IF money > 5000.'
  },
  'cc.base.if.census': {
    'summary': 'Base census conditions: unit count, building count and burning building count.',
    'howTo': 'E.g. IF buildingCount(oreRefinery) < 2.'
  },
  'cc.base.if.enemies': {
    'summary': 'Recon conditions: visible enemy unit and building counts.',
    'howTo': 'E.g. IF enemyUnitCount > 5 → build turrets.'
  },
  'cc.base.do.economy': {
    'summary': 'Economy blueprints: power plant, ore refinery and concrete wall.',
    'howTo': 'Pick them as buildingType in a build action.'
  },
  'cc.base.do.support': {
    'summary': 'Support blueprints: workshop, fire department, hospital, fuel station, ammo factory, radar and Command Center.',
    'howTo': 'Pick them as buildingType in a build action.'
  },
  'cc.base.do.production': {
    'summary': 'Production blueprints: vehicle factory, helipad, airstrip and construction yard.',
    'howTo': 'Pick them as buildingType in a build action.'
  },
  'cc.base.do.defence': {
    'summary': 'Fortification blueprints: turret guns V1–V3, rocket turret, Tesla coil and artillery turret.',
    'howTo': 'Pick them as buildingType in a build action.'
  },
  'cc.prod.start': {
    'summary': 'Opens the unit-build automation type and the "Unit build automation" opt-in switch.',
    'howTo': 'Add a "build unit" automation, e.g. WHILE unitCount(harvester) < 3 → build harvester.'
  },
  'cc.prod.if.economy': {
    'summary': 'Treasury feed conditions: money, money per minute and power.',
    'howTo': 'E.g. IF money > 3000.'
  },
  'cc.prod.if.census': {
    'summary': 'Force census conditions: unit count, building count and burning building count.',
    'howTo': 'E.g. IF unitCount(tank) < 6.'
  },
  'cc.prod.if.losses': {
    'summary': 'Casualty reports: react when one of your units is destroyed.',
    'howTo': 'E.g. IF ownUnitDestroyed → rebuild.'
  },
  'cc.prod.if.enemies': {
    'summary': 'Recon conditions: visible enemy unit and building counts.',
    'howTo': 'E.g. IF enemyUnitCount > 8 → build more tanks.'
  },
  'cc.prod.do.ground': {
    'summary': 'Armour line: tanks V1–V3, light tank, rocket tank, howitzer and harvester, delivered to the factory rally point.',
    'howTo': 'Pick them as unitType in a build-unit action.'
  },
  'cc.prod.do.support': {
    'summary': 'Support fleet: fire engine, ambulance, tanker and ammo trucks, recovery tank, mine layer and mine sweeper.',
    'howTo': 'Pick them as unitType in a build-unit action.'
  },
  'cc.prod.do.orders': {
    'summary': 'Deployment orders: newly built units attack the nearest enemy, harvesters or base, or defend harvesters or base.',
    'howTo': 'Pick them as delivery in a build-unit action.'
  },
  'cc.prod.do.air': {
    'summary': 'Air wing: Apache, F-22 Raptor and F-35.',
    'howTo': 'Pick them as unitType in a build-unit action.'
  },
  'cc.prod.do.naval': {
    'summary': 'Naval yard: destroyer, battleship, submarine, carrier, supply ship, hovercraft, ferry and naval mine layer.',
    'howTo': 'Pick them as unitType in a build-unit action.'
  }
})

export const PERKS = Object.freeze(definitions.map(([id,name,tree,variant,lane,order,cost,all,conditions = [],effects = [],options = []]) => Object.freeze({
  id, name, tree, variant, lane, order, cost, requires: all === null ? { any: laneEnds } : { all }, auto: cost === 0,
  summary: lane === 'start' ? `Activates ${name} for ${variant} automations.` : lane === 'capstone' ? 'Lets defence buildings earn veterancy and contribute stars.' : `Unlocks ${[...conditions, ...effects, ...options.flatMap(option => option[2])].join(', ')}.`,
  howTo: conditions.length ? `Use ${conditions[0]} in an IF, WHILE or AFTER condition.` : effects.length ? `Choose ${effects[0]} as a DO action.` : options.length ? `Choose ${options[0][2][0]} for ${options[0][1]}.` : lane === 'capstone' ? 'Earn turret veterancy from combat kills.' : `Create a ${variant} automation from the Command Center.`,
  unlocks: Object.freeze({ conditions: Object.freeze(conditions), effects: Object.freeze(effects), options: Object.freeze(options.map(([effect,param,values]) => Object.freeze({ effect,param,values:Object.freeze(values) }))) }),
  ...(PERK_TEXTS[id] || {}),
  badge: `images/perks/${id}.webp`, manualAnchor: `perk-${id}`
})))
const byId = new Map(PERKS.map(perk => [perk.id, perk]))
export const getPerk = id => byId.get(id)
export const perksForTree = tree => PERKS.filter(perk => perk.tree === tree)
