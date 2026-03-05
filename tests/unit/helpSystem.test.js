import { describe, expect, it } from 'vitest'
import { HelpSystem } from '../../src/input/helpSystem.js'

describe('helpSystem compatibility stub', () => {
  it('exposes showControlsHelp as a no-op', () => {
    const helpSystem = new HelpSystem()
    expect(() => helpSystem.showControlsHelp()).not.toThrow()
  })
})
