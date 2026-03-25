2026-03-25T18-55-53Z
Model: copilot

Prompt:

this is the result of the last e2e test run:

Error: State overlap 95.95% with mismatch branches: [{"branch":"$.mapTileState","mismatchCount":18,"samplePaths":["$.mapTileState[17][51].ore","$.mapTileState[17][52].ore","$.mapTileState[17][53].ore","$.mapTileState[17][54].ore","$.mapTileState[32][53].ore"]},{"branch":"$.harvestedTiles","mismatchCount":13,"samplePaths":["$.harvestedTiles[0]","$.harvestedTiles[10]","$.harvestedTiles[11]","$.harvestedTiles[12]","$.harvestedTiles[1]"]},{"branch":"$.aiFactoryBudgets","mismatchCount":3,"samplePaths":["$.aiFactoryBudgets.player2","$.aiFactoryBudgets.player3","$.aiFactoryBudgets.player4"]},{"branch":"$.gameState.refineryStatus","mismatchCount":2,"samplePaths":["$.gameState.refineryStatus","$.gameState.refineryStatus.1774464485218vota4"]},{"branch":"$.gameState.money","mismatchCount":1,"samplePaths":["$.gameState.money"]},{"branch":"$.gameState.rngState","mismatchCount":1,"samplePaths":["$.gameState.rngState.callCount"]},{"branch":"$.gameState.simulationAccumulator","mismatchCount":1,"samplePaths":["$.gameState.simulationAccumulator"]},{"branch":"$.gameState.totalMoneyEarned","mismatchCount":1,"samplePaths":["$.gameState.totalMoneyEarned"]}]

    expect(received).toBeGreaterThanOrEqual(expected)

    Expected: >= 99
    Received:    95.95

Could it be that the ore growth is non deterministic so that the way the ore growth varies after each session? Investigate and if that is the case ensure the way ore growth is pseudo random using the map seed as random seed so the replay sessions become deterministic based on the random seed of the map.