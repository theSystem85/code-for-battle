import { describe, expect, it } from 'vitest'
import { validateBattleResult } from '../../scripts/performance/battleValidity.js'

function validRun() {
  return {
    summary: { startUnits: 500, selected: 47, invalidSceneFrames: 0, cameraDriftFrames: 0, simulationMs: 1000, maxVisibleApacheRockets: 1, maxVisibleImpacts: 1, errors: [] },
    samples: [{ visible: 'visible', focused: true }, { visible: 'visible', focused: true }],
    fixtureSha256: 'abc', expectedFixtureSha256: 'abc', tutorialSeen: false
  }
}

describe('battle benchmark validity', () => {
  it('[U07213] accepts a foreground stationary battle with visible combat', () => {
    expect(validateBattleResult(validRun())).toEqual([])
  })
  it('[U07214] reports fixture and tutorial failures', () => {
    const run = validRun()
    run.fixtureSha256 = 'wrong'
    run.tutorialSeen = true
    expect(validateBattleResult(run)).toEqual(['fixture-hash-mismatch', 'tutorial-observed'])
  })
  it('[U07215] reports missing battle activity and simulation progress', () => {
    const run = validRun()
    run.summary.maxVisibleImpacts = 0
    run.summary.simulationMs = 0
    expect(validateBattleResult(run)).toEqual(['simulation-stalled', 'inactive-apache-combat'])
  })
  it('[U07216] reports background and camera drift', () => {
    const run = validRun()
    run.samples[0].focused = false
    run.summary.cameraDriftFrames = 1
    expect(validateBattleResult(run)).toEqual(['invalid-scene', 'camera-drift'])
  })
})
