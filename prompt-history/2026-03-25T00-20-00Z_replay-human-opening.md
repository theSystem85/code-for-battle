2026-03-25T00:20:00Z
copilot

User asked to rewrite the replay determinism four-player E2E so the human player is no longer passive.

Required scenario:

1. Human player must build `powerPlant`, `oreRefinery`, `vehicleFactory`, then produce a `tank`, then a `harvester`.
2. The recorded live match must start from the beginning.
3. The first produced human tank must be sent to attack enemy harvesters at the central ore field.
4. Recording must stop exactly when that tracked first tank is destroyed, and the game must be saved at that same moment.
5. The replay must then be loaded, played back at `5x` speed until it finishes, saved again, and the canonical saved-game JSON payloads must be compared for equivalence.

Applied changes reworked the Playwright scenario around explicit recorded human production and command issuance, tracked the first tank death as the recording cutoff, and switched the final assertion to compare the canonical `saveObj.state` payloads rather than only a looser subset.
