const node = (id, kind, suffix) => ({ type: 'node', id, kind, suffix })
const join = id => ({ type: 'joiner', id })
const arrow = { type: 'arrow' }
const group = (joiner, nodes) => ({ type: 'group', joiner, nodes })

export const FEATURE_IDS = [
  'economy',
  'tech',
  'arms',
  'logistics',
  'command',
  'controllers',
  'persistence',
  'multiplayer',
  'battlefield',
  'workshop'
]

export const ASSET_IDS = [
  'units',
  'buildings',
  'terrain',
  'vfx',
  'ui',
  'cursors',
  'sfx',
  'music',
  'narrator',
  'video'
]

export const TECH_ICONS = {
  constructionYard: '/images/sidebar/construction_yard.webp',
  powerPlant: '/images/sidebar/power_plant.webp',
  oreRefinery: '/images/sidebar/ore_refinery.webp',
  vehicleFactory: '/images/sidebar/vehicle_factory.webp',
  vehicleWorkshop: '/images/sidebar/vehicle_workshop.webp',
  radarStation: '/images/sidebar/radar_station.webp',
  gasStation: '/images/sidebar/gas_station.webp',
  hospital: '/images/sidebar/hospital.webp',
  helipad: '/images/sidebar/helipad_sidebar.webp',
  airstrip: '/images/sidebar/air_strip.webp',
  shipyard: '/images/sidebar/shipyard_sidebar.webp',
  ammunitionFactory: '/images/sidebar/ammunition_factory_sidebar.webp',
  turretGunV1: '/images/sidebar/turret_gun_v1.webp',
  turretGunV2: '/images/sidebar/turret_gun_v2.webp',
  turretGunV3: '/images/sidebar/turret_gun_v3.webp',
  rocketTurret: '/images/sidebar/rocket_turret.webp',
  teslaCoil: '/images/sidebar/tesla_coil.webp',
  artilleryTurret: '/images/sidebar/artillery_turret.webp',
  concreteWall: '/images/sidebar/concrete_wall.webp',
  street: null,
  tank: '/images/sidebar/tank.webp',
  tankV2: '/images/sidebar/tank_v2.webp',
  tankV3: '/images/sidebar/tank_v3.webp',
  rocketTank: '/images/sidebar/rocket_tank.webp',
  harvester: '/images/sidebar/harvester.webp',
  tankerTruck: '/images/sidebar/tanker_truck.webp',
  ammunitionTruck: '/images/sidebar/ammunition_truck_sidebar.webp',
  ambulance: '/images/sidebar/ambulance.webp',
  recoveryTank: '/images/sidebar/recovery_tank.webp',
  mineSweeper: '/images/sidebar/mine_sweeper_sidebar.webp',
  mineLayer: '/images/sidebar/mine_layer_sidebar.webp',
  howitzer: '/images/sidebar/howitzer_sidebar.webp',
  apache: '/images/sidebar/apache_sidebar.webp',
  f22Raptor: '/images/sidebar/f22_raptor_sidebar.webp',
  f35: '/images/sidebar/f35_sidebar.webp',
  destroyer: '/images/sidebar/destroyer_sidebar.webp',
  hovercraft: '/images/sidebar/hovercraft_sidebar.webp',
  vehicleFerry: '/images/sidebar/vehicle_ferry_sidebar.webp',
  aircraftCarrier: '/images/sidebar/aircraft_carrier_sidebar.webp',
  navalMineLayer: '/images/sidebar/naval_mine_layer_sidebar.webp',
  battleship: '/images/sidebar/battleship_sidebar.webp',
  submarine: '/images/sidebar/submarine_sidebar.webp',
  supplyShip: '/images/sidebar/supply_ship_sidebar.webp'
}

export const TECH_TREE = [
  {
    id: 'opening',
    titleKey: 'landing.tech.groups.opening',
    leadKey: 'landing.tech.groups.openingLead',
    rows: [
      [node('constructionYard', 'building'), node('street', 'building')],
      [
        node('constructionYard', 'building'),
        join('then'),
        node('powerPlant', 'building'),
        join('then'),
        node('oreRefinery', 'building'),
        join('then'),
        node('vehicleFactory', 'building')
      ],
      [
        node('vehicleFactory', 'building'),
        arrow,
        node('radarStation', 'building'),
        node('gasStation', 'building'),
        node('vehicleWorkshop', 'building'),
        node('hospital', 'building'),
        node('turretGunV1', 'building'),
        node('concreteWall', 'building')
      ]
    ]
  },
  {
    id: 'buildings',
    titleKey: 'landing.tech.groups.buildings',
    leadKey: 'landing.tech.groups.buildingsLead',
    rows: [
      [node('vehicleFactory', 'building'), arrow, node('ammunitionFactory', 'building')],
      [
        node('radarStation', 'building'),
        arrow,
        node('turretGunV2', 'building'),
        node('turretGunV3', 'building'),
        node('rocketTurret', 'building'),
        node('teslaCoil', 'building'),
        node('artilleryTurret', 'building'),
        node('airstrip', 'building'),
        node('helipad', 'building')
      ],
      [
        node('radarStation', 'building'),
        join('plus'),
        node('vehicleFactory', 'building'),
        arrow,
        node('shipyard', 'building')
      ]
    ]
  },
  {
    id: 'units',
    titleKey: 'landing.tech.groups.units',
    leadKey: 'landing.tech.groups.unitsLead',
    rows: [
      [node('vehicleFactory', 'building'), arrow, node('tank', 'unit')],
      [node('vehicleFactory', 'building'), join('plus'), node('oreRefinery', 'building'), arrow, node('harvester', 'unit')],
      [node('vehicleFactory', 'building'), join('plus'), node('gasStation', 'building'), arrow, node('tankerTruck', 'unit')],
      [node('vehicleFactory', 'building'), join('plus'), node('ammunitionFactory', 'building'), arrow, node('ammunitionTruck', 'unit')],
      [node('hospital', 'building'), arrow, node('ambulance', 'unit')],
      [
        node('vehicleFactory', 'building'),
        join('plus'),
        node('vehicleWorkshop', 'building'),
        arrow,
        node('recoveryTank', 'unit'),
        node('mineSweeper', 'unit')
      ],
      [
        node('vehicleFactory', 'building'),
        join('plus'),
        node('vehicleWorkshop', 'building'),
        join('plus'),
        node('ammunitionFactory', 'building'),
        arrow,
        node('mineLayer', 'unit')
      ],
      [node('vehicleFactory', 'building', 'two'), arrow, node('tankV3', 'unit')],
      [node('radarStation', 'building'), arrow, node('tankV2', 'unit')],
      [
        node('vehicleFactory', 'building'),
        join('plus'),
        node('radarStation', 'building'),
        join('plus'),
        node('artilleryTurret', 'building'),
        arrow,
        node('howitzer', 'unit')
      ],
      [node('helipad', 'building'), arrow, node('apache', 'unit')],
      [node('airstrip', 'building'), arrow, node('f22Raptor', 'unit')],
      [
        node('ammunitionFactory', 'building'),
        join('plus'),
        group('or', [node('helipad', 'building'), node('airstrip', 'building')]),
        arrow,
        node('f35', 'unit')
      ],
      [node('rocketTurret', 'building'), arrow, node('rocketTank', 'unit')],
      [
        node('shipyard', 'building'),
        arrow,
        node('destroyer', 'unit'),
        node('hovercraft', 'unit'),
        node('vehicleFerry', 'unit'),
        node('aircraftCarrier', 'unit'),
        node('navalMineLayer', 'unit'),
        node('battleship', 'unit'),
        node('submarine', 'unit')
      ],
      [
        node('shipyard', 'building'),
        join('plus'),
        group('or', [
          node('gasStation', 'building'),
          node('hospital', 'building'),
          node('ammunitionFactory', 'building'),
          node('vehicleWorkshop', 'building')
        ]),
        arrow,
        node('supplyShip', 'unit')
      ]
    ]
  }
]

export function collectTechNodeIds(tree = TECH_TREE) {
  const ids = new Set()
  const walk = token => {
    if (!token) return
    if (token.type === 'node') ids.add(token.id)
    if (token.type === 'group') token.nodes.forEach(walk)
  }
  tree.forEach(section => section.rows.forEach(row => row.forEach(walk)))
  return [...ids]
}

export const LEGAL_HREFS = {
  de: {
    imprint: '/impressum',
    privacy: '/datenschutz',
    contact: '/kontakt'
  },
  en: {
    imprint: '/imprint',
    privacy: '/privacy',
    contact: '/contact'
  }
}
