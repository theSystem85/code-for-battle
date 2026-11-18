export function validateBattleResult({ summary, samples, fixtureSha256, expectedFixtureSha256, tutorialSeen }) {
  const failures = []
  if (expectedFixtureSha256 && fixtureSha256 !== expectedFixtureSha256) failures.push('fixture-hash-mismatch')
  if (tutorialSeen) failures.push('tutorial-observed')
  if (summary.startUnits < 400 || summary.selected < 1) failures.push('invalid-army')
  if (summary.invalidSceneFrames > 0 || samples.some(sample => sample.visible !== 'visible' || !sample.focused)) failures.push('invalid-scene')
  if (summary.cameraDriftFrames > 0) failures.push('camera-drift')
  if (summary.simulationMs <= 0) failures.push('simulation-stalled')
  if (summary.maxVisibleApacheRockets <= 0 || summary.maxVisibleImpacts <= 0) failures.push('inactive-apache-combat')
  if (summary.errors.length) failures.push('page-errors')
  if (samples.length < 2) failures.push('insufficient-samples')
  return failures
}
