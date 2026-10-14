import process from 'node:process'
import console from 'node:console'
import { performance } from 'node:perf_hooks'
import { evaluateMusicDirector, recordMusicDamage, resetMusicDirector } from '../../src/audio/musicDirector.js'

// CPU diagnostic only; this cannot certify presented FPS or GPU performance.
for (const count of [40, 200, 500, 2000]) {
  resetMusicDirector()
  const state = { simulationTime: 0, humanPlayer: 'player1', money: 2000, availableUnitTypes: new Set(['tank']) }
  const units = Array.from({ length: count }, (_, index) => ({
    type: 'tank', health: 100, owner: index % 3 ? 'enemy' : 'player1', x: index % 20 * 32, y: Math.floor(index / 20) * 32
  }))
  const samples = []
  const queue = { currentUnit: {} }
  const costs = { tank: 1000 }
  const buildings = []
  const factories = []
  const heapBefore = process.memoryUsage().heapUsed
  for (let index = 0; index < 10000; index++) {
    state.simulationTime = index * 1000
    recordMusicDamage(units[1], units[0], 1, state, 32)
    const start = performance.now()
    evaluateMusicDirector(state, units, buildings, factories, queue, 32, costs)
    samples.push(performance.now() - start)
  }
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore
  samples.sort((a, b) => a - b)
  console.log(JSON.stringify({ units: count, calls: samples.length, meanMs: samples.reduce((sum, time) => sum + time, 0) / samples.length, p95Ms: samples[9500], p99Ms: samples[9900], maxMs: samples.at(-1), heapDeltaBytes }))
}
