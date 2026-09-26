export function findFactoryById(candidates, factoryId) {
  if (factoryId == null || factoryId === '' || !Array.isArray(candidates)) return null
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]
    if (candidate && candidate.id === factoryId) return candidate
  }
  return null
}

export function resolveExplicitSpawnFactory(allCandidates, availableCandidates, factoryId) {
  if (factoryId == null || factoryId === '') {
    return { status: 'fallback', factory: null }
  }
  const preferred = findFactoryById(allCandidates, factoryId)
  if (!preferred) return { status: 'fallback', factory: null }
  const usablePool = availableCandidates || allCandidates
  if (!findFactoryById(usablePool, factoryId)) {
    return { status: 'unavailable', factory: preferred }
  }
  return { status: 'chosen', factory: preferred }
}
