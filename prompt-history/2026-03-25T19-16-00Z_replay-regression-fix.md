2026-03-25T19-16-00Z
Model: copilot

Prompt:

now the score got even worse:

Error: State overlap 93.93% with mismatch branches: [{"branch":"$.buildings[12]","mismatchCount":8,"samplePaths":["$.buildings[12].health","$.buildings[12].id","$.buildings[12].maxHealth","$.buildings[12].owner","$.buildings[12].rallyPoint"]},{"branch":"$.buildings[14]","mismatchCount":8,"samplePaths":["$.buildings[14].health","$.buildings[14].id","$.buildings[14].maxHealth","$.buildings[14].owner","$.buildings[14].rallyPoint"]},{"branch":"$.buildings[10]","mismatchCount":7,"samplePaths":["$.buildings[10].health","$.buildings[10].id","$.buildings[10].maxHealth","$.buildings[10].rallyPoint","$.buildings[10].type"]},{"branch":"$.buildings[11]","mismatchCount":7,"samplePaths":["$.buildings[11].health","$.buildings[11].id","$.buildings[11].maxHealth","$.buildings[11].rallyPoint","$.buildings[11].type"]},{"branch":"$.buildings[13]","mismatchCount":5,"samplePaths":["$.buildings[13].id","$.buildings[13].owner","$.buildings[13].type","$.buildings[13].x","$.buildings[13].y"]},{"branch":"$.aiFactoryBudgets","mismatchCount":3,"samplePaths":["$.aiFactoryBudgets.player2","$.aiFactoryBudgets.player3","$.aiFactoryBudgets.player4"]},{"branch":"$.buildings[15]","mismatchCount":2,"samplePaths":["$.buildings[15].health","$.buildings[15].id"]}]

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 99
Received:    93.93