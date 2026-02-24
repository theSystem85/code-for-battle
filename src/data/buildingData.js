/**
 * Building data definitions
 *
 * This module is kept minimal with only essential dependencies to avoid
 * circular import issues. It exports the pure building data that can be
 * safely imported by any module including tests.
 */

import {
  HELIPAD_FUEL_CAPACITY,
  HELIPAD_RELOAD_TIME,
  HELIPAD_AMMO_RESERVE,
  UNIT_AMMO_CAPACITY
} from '../config.js'

// Building dimensions and costs
export const buildingData = {
  powerPlant: {
    width: 3,
    height: 3,
    cost: 2000,
    power: 200,
    image: 'power_plant.webp',
    displayName: 'Power Plant',
    health: 200,
    smokeSpots: [
      { x: 80, y: 20 },
      { x: 130, y: 40 }
    ]
  },
  oreRefinery: {
    width: 3,
    height: 3,
    cost: 2500,
    power: -150,
    image: 'ore_refinery.webp',
    displayName: 'Ore Refinery',
    health: 200,
    smokeSpots: [
      { x: 55, y: 35 },
      { x: 78, y: 12 }
    ]
  },
  vehicleFactory: {
    width: 3,
    height: 3,
    cost: 3000,
    power: -50,
    image: 'vehicle_factory.webp',
    displayName: 'Vehicle Factory',
    health: 300,
    smokeSpots: []
  },
  vehicleWorkshop: {
    width: 3,
    height: 3,
    cost: 3000,
    power: -20,
    image: 'vehicle_workshop.webp',
    displayName: 'Vehicle Workshop',
    health: 300,
    armor: 3,
    smokeSpots: []
  },
  constructionYard: {
    width: 3,
    height: 3,
    cost: 5000,
    power: 50,
    image: 'construction_yard.webp',
    displayName: 'Construction Yard',
    health: 350,
    smokeSpots: []
  },
  radarStation: {
    width: 2,
    height: 2,
    cost: 1500,
    power: -50,
    image: 'radar_station.webp',
    displayName: 'Radar Station',
    health: 200,
    smokeSpots: []
  },
  hospital: {
    width: 3,
    height: 3,
    cost: 4000,
    power: -50,
    image: 'hospital.webp',
    displayName: 'Hospital',
    health: 200,
    smokeSpots: []
  },
  helipad: {
    width: 2,
    height: 2,
    cost: 1000,
    power: -20,
    image: 'helipad_sidebar.webp',
    displayName: 'Helipad',
    health: 300,
    requiresRadar: true,
    maxFuel: HELIPAD_FUEL_CAPACITY,
    fuelReloadTime: HELIPAD_RELOAD_TIME,
    maxAmmo: HELIPAD_AMMO_RESERVE,
    ammoReloadTime: HELIPAD_RELOAD_TIME,
    smokeSpots: []
  },
  airstrip: {
    width: 12,
    height: 6,
    cost: 10000,
    power: -200,
    image: 'air_strip.webp',
    displayName: 'Airstrip',
    health: 10000,
    requiresRadar: true,
    maxFuel: HELIPAD_FUEL_CAPACITY,
    fuelReloadTime: HELIPAD_RELOAD_TIME,
    maxAmmo: HELIPAD_AMMO_RESERVE,
    ammoReloadTime: HELIPAD_RELOAD_TIME,
    smokeSpots: []
  },
  gasStation: {
    width: 3,
    height: 3,
    cost: 2000,
    power: -30,
    image: 'gas_station.webp',
    displayName: 'Gas Station',
    health: 50,
    smokeSpots: []
  },
  ammunitionFactory: {
    width: 3,
    height: 3,
    cost: 2000,
    power: -40,
    image: 'ammunition_factory_map.webp',
    displayName: 'Ammunition Factory',
    health: 250,
    armor: 2,
    requiresVehicleFactory: true,
    smokeSpots: []
  },
  turretGunV1: {
    width: 1,
    height: 1,
    cost: 1200,
    power: -10,
    image: 'turret_gun_v1.webp',
    displayName: 'Turret Gun V1',
    health: 300,
    smokeSpots: [],
    // Add combat properties
    fireRange: 10, // 50% more than tank range (TANK_FIRE_RANGE + 50%)
    fireCooldown: 3000, // Same as regular tank
    damage: 10, // Reduced by 50% (was 20)
    armor: 1,
    projectileType: 'bullet',
    projectileSpeed: 12, // 4x faster (was 3)
    maxAmmo: UNIT_AMMO_CAPACITY.tank_v1 * 4
  },
  turretGunV2: {
    width: 1,
    height: 1,
    cost: 2000,
    power: -20,
    image: 'turret_gun_v2.webp',
    displayName: 'Turret Gun V2',
    health: 300,
    smokeSpots: [],
    // Add combat properties
    fireRange: 10, // 50% more than tank range
    fireCooldown: 3000,
    damage: 12, // Reduced by 50% (was 24)
    armor: 1,
    projectileType: 'bullet',
    projectileSpeed: 16, // 4x faster (was 4)
    burstFire: true,
    burstCount: 2,
    burstDelay: 150, // ms between burst shots
    maxAmmo: UNIT_AMMO_CAPACITY.tank_v1 * 4
  },
  turretGunV3: {
    width: 1,
    height: 1,
    cost: 3000,
    power: -30,
    image: 'turret_gun_v3.webp',
    displayName: 'Turret Gun V3',
    health: 300,
    smokeSpots: [],
    // Add combat properties
    fireRange: 12, // Even more range
    fireCooldown: 3500, // Faster firing
    damage: 15, // Reduced by 50% (was 30)
    armor: 1.5,
    projectileType: 'bullet',
    projectileSpeed: 15,
    burstFire: true, // Special feature: fires 3 shots in quick succession
    burstCount: 3,
    burstDelay: 150, // ms between burst shots
    maxAmmo: UNIT_AMMO_CAPACITY.tank_v1 * 4
  },
  rocketTurret: {
    width: 2,
    height: 2,
    cost: 4000,
    power: -20,
    image: 'rocket_turret.webp',
    displayName: 'Rocket Turret',
    health: 200,
    requiresRadar: true,
    smokeSpots: [],
    // Add combat properties
    fireRange: 16,
    fireCooldown: 6000, // 3 seconds between shots
    damage: 18,
    armor: 2, // 2x the armor of a tank
    projectileType: 'rocket',
    projectileSpeed: 5,
    burstFire: true, // Special feature: fires 6 shots in quick succession
    burstCount: 6,
    burstDelay: 500, // ms between burst shots
    maxAmmo: UNIT_AMMO_CAPACITY.rocketTank * 4
  },
  teslaCoil: {
    width: 2,
    height: 2,
    cost: 5000,
    power: -60,
    image: 'tesla_coil.webp',
    displayName: 'Tesla Coil',
    health: 250,
    requiresRadar: true,
    smokeSpots: [],
    fireRange: 20, // in tiles
    fireCooldown: 8000, // ms
    damage: 5, // Tesla coil does not deal direct damage
    armor: 2,
    projectileType: 'tesla',
    projectileSpeed: 0,
    isTeslaCoil: true
  },
  artilleryTurret: {
    width: 2,
    height: 2,
    cost: 4000,
    power: -45,
    image: 'artillery_turret.webp',
    displayName: 'Artillery Turret',
    health: 300,
    smokeSpots: [],
    fireRange: 36,
    minFireRange: 5, // Units closer than 5 tiles cannot be attacked
    fireCooldown: 7000, // 7 seconds between shots
    damage: 100, // 500% of a tank's base damage
    armor: 2,
    projectileType: 'artillery',
    projectileSpeed: 0.75,
    maxAmmo: UNIT_AMMO_CAPACITY.howitzer * 4
  },
  concreteWall: {
    width: 1,
    height: 1,
    cost: 100,
    power: 0,
    image: 'concrete_wall.webp',
    displayName: 'Concrete Wall',
    health: 200,
    smokeSpots: []
  }
}
