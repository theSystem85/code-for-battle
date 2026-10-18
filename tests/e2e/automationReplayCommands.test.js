import { expect, test } from '@playwright/test'

test('[E00011] recorded automation command survives replay while the live engine is frozen', async({ page }) => {
  await page.goto('/?size=60&players=2&seed=5&oreFields=1')
  const result = await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { installPolicyGameBindings } = await import('/src/policies/policyGameBindings.js')
    const { executeUnitCommand } = await import('/src/policies/unitCommandApi.js')
    const { updateUnitPolicies } = await import('/src/policies/policyEngine.js')
    const { updateReplayPlayback } = await import('/src/replaySystem.js')
    const ctx = installPolicyGameBindings({ units: [], buildings: [], mapGrid: [], bullets: [], now: 150 })
    const make = () => ({ id: 'automation-replay-tank', type: 'tank', owner: 'player1', health: 100,
      x: 32, y: 32, tileX: 1, tileY: 1, turretDirection: 0 })
    const live = make()
    gameState.gamePaused = false
    gameState.simulationTime = 150
    gameState.replayMode = false
    gameState.replay = { recordingActive: true, recordingStartedAt: 0, commands: [] }
    const accepted = executeUnitCommand('turretLeft', live, {}, ctx)
    const commands = gameState.replay.commands.slice()
    const restored = make()
    restored.policyBindings = [{ policyId: 'missing', runtime: { currentStateId: 'frozen' } }]
    gameState.units = [restored]
    gameState.replayMode = true
    gameState.replay = { recordingActive: false, playbackActive: true, playbackStartedAt: 0,
      playbackCursor: 0, playbackCommands: commands, unitIdAliases: {}, deferredPlaybackEntries: [] }
    updateUnitPolicies([restored], ctx, 150)
    updateReplayPlayback()
    return { accepted, recorded: commands.length, expected: live.turretDirection,
      actual: restored.turretDirection, state: restored.policyBindings[0].runtime.currentStateId,
      replayed: gameState.replay.playbackCursor }
  })
  expect(result).toMatchObject({ accepted: true, recorded: 1, replayed: 1, state: 'frozen' })
  expect(result.actual).toBe(result.expected)
})
