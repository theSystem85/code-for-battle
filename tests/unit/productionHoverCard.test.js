import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { visitProductionUnlocks } from '../../src/production/techTree.js'
import { getProductionDuration } from '../../src/production/timing.js'
import {
  buildProductionUnlockIndex,
  formatProductionUnlocks,
  getCardBuildTime,
  getProductionUnlocks,
  setupProductionHoverCard
} from '../../src/ui/productionHoverCard.js'

const pageMarkup = readFileSync(resolve('index.html'), 'utf8')

function loadProductionButtons() {
  const page = new window.DOMParser().parseFromString(pageMarkup, 'text/html')
  document.body.innerHTML = page.querySelector('#production').outerHTML
}

describe('production hover card data', () => {
  beforeEach(loadProductionButtons)

  it('uses the queue cost scaling, producer bonuses and low-power modifier', () => {
    expect(getProductionDuration(2000, false)).toBe(12000)
    expect(getProductionDuration(2000, false, 2, 0.5)).toBe(12000)
    expect(getProductionDuration(2000, true, 2)).toBe(1500)
    expect(getProductionDuration(2000, true, 3, 0.5)).toBe(2000)
  })

  it('derives direct unlocks from the gameplay tree without counting dependencies twice', () => {
    const index = buildProductionUnlockIndex()
    expect(index.get('radarStation')).toEqual({
      units: ['tank-v2', 'howitzer'],
      buildings: ['shipyard', 'helipad', 'airstrip', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret']
    })
    expect(index.get('vehicleFactory').units).toEqual(expect.arrayContaining(['tank', 'lightTank', 'tank-v3', 'harvester', 'mineLayer']))
    expect(index.get('vehicleFactory').units).not.toContain('tank_v1')
    expect(new Set(index.get('vehicleFactory').units).size).toBe(index.get('vehicleFactory').units.length)
    expect(index.get('ammunitionFactory').units).toEqual(['ammunitionTruck', 'mineLayer', 'f35', 'supplyShip'])
    expect(index.get('helipad').units).toEqual(['apache', 'f35'])
    expect(index.get('shipyard').units).toHaveLength(8)
    expect(index.get('concreteWall')).toEqual({ units: [], buildings: [] })
  })

  it.each([
    ['constructionYard', 0, ['powerPlant']],
    ['powerPlant', 0, ['oreRefinery']],
    ['oreRefinery', 1, ['vehicleFactory']],
    ['vehicleFactory', 10, ['radarStation', 'gasStation', 'vehicleWorkshop', 'ammunitionFactory', 'hospital', 'turretGunV1', 'concreteWall']],
    ['radarStation', 2, ['shipyard', 'helipad', 'airstrip', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret']],
    ['vehicleWorkshop', 4, ['constructionYard']]
  ])('attributes %s unlocks to the last normal-build-order prerequisite', (type, units, buildings) => {
    const unlocks = buildProductionUnlockIndex().get(type)
    expect(unlocks.units).toHaveLength(units)
    expect([...unlocks.buildings].sort()).toEqual([...buildings].sort())
    expect(new Set(unlocks.units).size).toBe(unlocks.units.length)
    expect(new Set(unlocks.buildings).size).toBe(unlocks.buildings.length)
  })

  it('counts only items that have production buttons, even when tech data contains more', () => {
    const buttons = document.querySelectorAll('[data-building-type="vehicleFactory"], [data-building-type="ammunitionFactory"], [data-unit-type="tank"]')
    const index = buildProductionUnlockIndex(buttons)
    expect(index.get('vehicleFactory')).toEqual({ units: ['tank'], buildings: ['ammunitionFactory'] })
    expect(index.get('radarStation')).toBeUndefined()
  })

  it('preserves gameplay requirements for alternatives, combined prerequisites and two factories', () => {
    const unlocked = new Set()
    const controller = { forceUnlockUnitType: type => unlocked.add(type), forceUnlockBuildingType: vi.fn() }
    const buildings = types => types.map(type => ({ type, owner: 'player', health: 100 }))
    visitProductionUnlocks(buildings(['vehicleFactory', 'helipad']), 'player', controller)
    expect(unlocked.has('apache')).toBe(true)
    expect(unlocked.has('f35')).toBe(false)
    expect(unlocked.has('tank-v3')).toBe(false)
    unlocked.clear()
    visitProductionUnlocks(buildings(['vehicleFactory', 'vehicleFactory', 'airstrip', 'ammunitionFactory']), 'player', controller)
    expect(unlocked.has('tank-v3')).toBe(true)
    expect(unlocked.has('f35')).toBe(true)
    expect(unlocked.has('mineLayer')).toBe(false)
    unlocked.clear()
    visitProductionUnlocks(buildings(['shipyard', 'hospital']), 'player', controller)
    expect(unlocked.has('supplyShip')).toBe(true)
    unlocked.clear()
    visitProductionUnlocks(buildings(['vehicleFactory']), 'enemy', controller)
    expect(unlocked.size).toBe(0)
  })

  it('reuses cached unlock results and handles units and empty unlocks gracefully', () => {
    expect(getProductionUnlocks('building', 'radarStation')).toBe(getProductionUnlocks('building', 'radarStation'))
    expect(formatProductionUnlocks(getProductionUnlocks('unit', 'tank'))).toBe('Unlocks: none')
    expect(formatProductionUnlocks({ units: ['tank'], buildings: ['shipyard'] })).toBe('Unlocks: 1 unit, 1 building')
  })

  it('uses current producer counts and power, with a baseline for unavailable producers', () => {
    const queue = { getConstructionYardMultiplier: () => 2, getVehicleFactoryMultiplier: () => 3 }
    expect(getCardBuildTime('building', 'powerPlant', {}, queue)).toBe('Build time: 1.5s')
    expect(getCardBuildTime('building', 'powerPlant', { playerPowerSupply: -100, playerBuildSpeedModifier: 0.5 }, queue)).toBe('Build time: 3s')
    expect(getCardBuildTime('unit', 'apache', {}, queue)).toBe('Build time: 6s')
    queue.getVehicleFactoryMultiplier = () => 0
    expect(getCardBuildTime('unit', 'apache', {}, queue)).toBe('Build time: 18s')
    queue.getVehicleFactoryMultiplier = vi.fn(() => 10)
    getCardBuildTime('unit', 'destroyer', {}, queue)
    expect(queue.getVehicleFactoryMultiplier).not.toHaveBeenCalled()
  })
})

describe('production hover sheet setup', () => {
  beforeEach(loadProductionButtons)

  it('moves existing labels into one sheet, preserves queue indicators and refreshes on entry', () => {
    const button = document.querySelector('[data-building-type="powerPlant"]')
    const name = button.querySelector('.building-name')
    const state = { playerPowerSupply: 100 }
    const queue = { getConstructionYardMultiplier: () => 2 }
    const context = { kind: 'building', type: 'powerPlant' }
    setupProductionHoverCard(button, context, state, queue)
    setupProductionHoverCard(button, context, state, queue)
    expect(button.querySelectorAll('.production-hover-sheet')).toHaveLength(1)
    expect(button.querySelector('.production-hover-sheet').firstChild).toBe(name)
    expect(button.querySelector('.building-cost').textContent).toBe('Cost: $2000')
    expect(button.querySelector('.building-power').textContent).toBe('Power: +200 MW')
    expect(button.querySelector('.production-unlocks').textContent).toBe('Unlocks: 0 units, 1 building')
    expect(button.querySelector('.batch-counter').parentElement).toBe(button)
    expect(button.querySelector('.production-progress').parentElement).toBe(button)
    expect(button.querySelector('[title]')).toBeNull()
    state.playerPowerSupply = -100
    state.playerBuildSpeedModifier = 0.5
    button.dispatchEvent(new Event('pointerenter'))
    expect(button.querySelector('.production-build-time').textContent).toBe('Build time: 3s')
    const click = vi.fn()
    button.addEventListener('click', click)
    button.querySelector('.production-unlocks').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(click).toHaveBeenCalledOnce()
  })

  it('omits unlocks on unit cards and refreshes requirement text only on entry or focus', () => {
    const button = document.querySelector('[data-unit-type="tank"]')
    const queue = { getVehicleFactoryMultiplier: () => 1 }
    setupProductionHoverCard(button, { kind: 'unit', type: 'tank' }, {}, queue)
    expect(button.querySelector('.production-unlocks')).toBeNull()
    expect(button.querySelector('.production-unlock-names')).toBeNull()
    const requirement = button.querySelector('.production-requirement')
    expect(requirement.hidden).toBe(true)
    button.dataset.requirement = 'Requires Vehicle Factory'
    expect(requirement.hidden).toBe(true)
    button.dispatchEvent(new Event('pointerenter'))
    expect(requirement.textContent).toBe('Requires Vehicle Factory')
    expect(requirement.hidden).toBe(false)
    button.dataset.requirement = 'Requires Vehicle Factory & Hospital'
    button.dispatchEvent(new Event('focus'))
    expect(requirement.textContent).toBe('Requires Vehicle Factory & Hospital')
    button.dataset.requirement = ''
    button.dispatchEvent(new Event('pointerenter'))
    expect(requirement.hidden).toBe(true)
    expect(requirement.textContent).toBe('')
    expect(button.querySelector('[title]')).toBeNull()
  })

  it('retains empty unlocks only for buildings and exposes their current requirements', () => {
    const button = document.querySelector('[data-building-type="concreteWall"]')
    const queue = { getConstructionYardMultiplier: () => 2 }
    setupProductionHoverCard(button, { kind: 'building', type: 'concreteWall' }, {}, queue)
    expect(button.querySelector('.production-unlocks').textContent).toBe('Unlocks: none')
    button.dataset.requirement = 'Requires Vehicle Factory'
    button.dispatchEvent(new Event('focus'))
    expect(button.querySelector('.production-requirement').textContent).toBe('Requires Vehicle Factory')
  })

})
