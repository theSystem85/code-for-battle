import { renderProfiler } from './renderProfiler.js'

export function isFunctionTimingEnabled() {
  return renderProfiler.isEnabled()
}

export function setFunctionTimingEnabled(nextEnabled) {
  return renderProfiler.setEnabled(nextEnabled)
}

export function subscribeFunctionTiming(listener) {
  return renderProfiler.subscribe(listener)
}

export function resetFunctionTimingForTests() {
  renderProfiler.setEnabled(false, { persist: false })
  renderProfiler.reset()
  renderProfiler.clearListenersForTests()
}
