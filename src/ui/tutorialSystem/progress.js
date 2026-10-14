export const TUTORIAL_PROGRESS_VERSION = 2

/** Version 1 stored a layout-dependent index. Resolve it against the old list
 * once, then retain stable IDs when steps are inserted or layouts change. */
export function migrateTutorialProgress(saved, steps, allSteps = steps) {
  if (!saved) return { completed: false, stepIndex: 0, stepId: steps[0]?.id || null, version: TUTORIAL_PROGRESS_VERSION }
  if (saved.completed) return { ...saved, completed: true, stepIndex: steps.length, stepId: null, version: TUTORIAL_PROGRESS_VERSION }
  const previousIndex = Number.isInteger(saved.stepIndex) && saved.stepIndex >= 0 ? saved.stepIndex : 0
  const legacySteps = steps.filter(step => step.id !== 'input-method')
  let id = saved.stepId
  if (saved.version !== TUTORIAL_PROGRESS_VERSION && !id) id = legacySteps[previousIndex]?.id
  let index = steps.findIndex(step => step.id === id)
  if (index < 0 && id) {
    const previousPosition = allSteps.findIndex(step => step.id === id)
    const following = previousPosition >= 0 ? allSteps.slice(previousPosition + 1).find(step => steps.some(visible => visible.id === step.id)) : null
    if (following) index = steps.findIndex(step => step.id === following.id)
  }
  if (index < 0) index = Math.min(previousIndex, Math.max(0, steps.length - 1))
  const progress = { ...saved, completed: false, stepIndex: index, stepId: steps[index]?.id || null, version: TUTORIAL_PROGRESS_VERSION }
  if (saved.resumeAfterInputStepId) progress.resumeAfterInputStepId = migrateTutorialProgress({ version: TUTORIAL_PROGRESS_VERSION, stepId: saved.resumeAfterInputStepId, stepIndex: 0 }, steps, allSteps).stepId
  return progress
}
