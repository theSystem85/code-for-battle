import { describe, expect, it } from 'vitest'
import { deterministicRNG } from '../../src/network/deterministicRandom.js'
import { drawTeslaCoilLightning } from '../../src/rendering/renderingUtils.js'

describe('Visual randomness', () => {
  it('[U07246] draws tesla lightning without consuming simulation randomness', () => {
    const previous = deterministicRNG.getState()
    deterministicRNG.setSeed(19)
    deterministicRNG.enable()
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      createLinearGradient() {
        return { addColorStop() {} }
      }
    }
    try {
      const before = deterministicRNG.getCallCount()
      drawTeslaCoilLightning(ctx, 0, 0, 80, 40)
      expect(deterministicRNG.getCallCount()).toBe(before)
    } finally {
      deterministicRNG.setState(previous)
    }
  })
})
