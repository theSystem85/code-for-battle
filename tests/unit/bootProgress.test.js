import { describe, expect, it } from 'vitest'
import {
  asymptoticPhaseFraction,
  bootPhasesForBackend,
  createBootProgress,
  gpuBootFraction
} from '../../src/ui/bootProgress.js'

function shareOf(phases, id) {
  const total = phases.reduce((sum, phase) => sum + phase.expectedMs, 0)
  return phases.find(phase => phase.id === id).expectedMs / total
}

describe('bootProgress', () => {
  it('keeps an asymptotic phase inside its range until that phase finishes', () => {
    const fraction = asymptoticPhaseFraction(400, 400)
    expect(fraction).toBeGreaterThan(0.9)
    expect(fraction).toBeLessThan(1)
    expect(asymptoticPhaseFraction(0, 400)).toBe(0)
    expect(asymptoticPhaseFraction(5000, 400)).toBeLessThan(1)
  })

  it('weights WebGL boot time toward sprite and texture preparation', () => {
    const phases = bootPhasesForBackend('webgl')
    expect(shareOf(phases, 'assets')).toBeGreaterThan(0.7)
    expect(shareOf(phases, 'present')).toBeGreaterThan(0.1)
    expect(shareOf(phases, 'present')).toBeLessThan(0.2)
    expect(phases.some(phase => phase.id === 'backend')).toBe(false)
  })

  it('gives WebGPU presentation a share of the measured device and shader cost', () => {
    const phases = bootPhasesForBackend('webgpu')
    expect(shareOf(phases, 'assets')).toBeGreaterThan(0.4)
    expect(shareOf(phases, 'present')).toBeGreaterThan(0.35)
    expect(gpuBootFraction(0)).toBe(0)
    expect(gpuBootFraction(1)).toBeCloseTo(752 / (752 + 708 + 403), 5)
    expect(gpuBootFraction(3)).toBe(1)
  })

  it('moves with prepared-sprite work instead of sitting near 66 percent', () => {
    const boot = createBootProgress(bootPhasesForBackend('webgl'), { floor: 0 })
    boot.finish('storage', 0)
    boot.start('assets', 0)
    boot.setPartFraction('assets', 'sprites', 0, 0)
    boot.setPartFraction('assets', 'textures', 0, 0)

    const atStart = boot.sample(0)
    expect(atStart).toBeLessThan(0.1)

    boot.setPartFraction('assets', 'sprites', 150 / 300, 960)
    const halfway = boot.sample(960)
    const assetShare = shareOf(bootPhasesForBackend('webgl'), 'assets')
    expect(halfway).toBeGreaterThan(assetShare * 0.4)
    expect(halfway).toBeLessThan(assetShare * 0.65)

    boot.setPartFraction('assets', 'sprites', 151 / 300, 970)
    const nextSprite = boot.sample(970)
    expect(nextSprite).toBeGreaterThan(halfway)
  })

  it('does not move backwards when a later report is lower', () => {
    const boot = createBootProgress(bootPhasesForBackend('webgl'), { floor: 0.04 })
    boot.finish('storage', 0)
    boot.start('assets', 0)
    boot.setPartFraction('assets', 'sprites', 0.8, 100)
    const high = boot.sample(100)
    boot.setPartFraction('assets', 'sprites', 0.2, 110)
    expect(boot.sample(110)).toBe(high)
    expect(high).toBeGreaterThanOrEqual(0.04)
  })

  it('reaches 100 percent only when loading is finished', () => {
    const boot = createBootProgress(bootPhasesForBackend('webgl'), { floor: 0 })
    boot.finish('storage', 0)
    boot.finish('assets', 1)
    boot.finish('map', 2)
    boot.finish('systems', 3)
    boot.finish('present', 4)
    expect(boot.sample(5)).toBeLessThan(1)
    expect(Math.round(boot.sample(5) * 100)).toBeLessThan(100)
    expect(boot.finishAll()).toBe(1)
    expect(boot.sample(6)).toBe(1)
  })

  it('keeps WebGL progress monotonic when the WebGPU tail is removed', () => {
    const boot = createBootProgress(bootPhasesForBackend('webgpu'), { floor: 0 })
    boot.finish('storage', 0)
    boot.start('backend', 0)
    const before = boot.sample(20)
    boot.applyWebGLProfile()
    boot.finish('backend', 21)
    expect(boot.sample(21)).toBeGreaterThanOrEqual(before)
    expect(boot.hasPart('present', 'gpu')).toBe(false)
  })

  it('tracks the slower parallel asset instead of averaging past it', () => {
    const boot = createBootProgress(bootPhasesForBackend('webgl'), { floor: 0 })
    boot.finish('storage', 0)
    boot.start('assets', 0)
    boot.setPartFraction('assets', 'sprites', 0.25, 0)
    boot.setPartFraction('assets', 'textures', 0.9, 0)
    const limited = boot.sample(0)
    boot.setPartFraction('assets', 'sprites', 0.5, 1)
    expect(boot.sample(1)).toBeGreaterThan(limited)
    expect(limited).toBeLessThan(shareOf(bootPhasesForBackend('webgl'), 'assets') * 0.4)
  })

})
