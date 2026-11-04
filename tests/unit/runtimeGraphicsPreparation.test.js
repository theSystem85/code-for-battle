import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withPreparedRendering } from '../../src/rendering/prepared/runtimeGraphicsPreparation.js'

const loading = vi.hoisted(() => ({ visible: false, session: 0 }))
vi.mock('../../src/ui/loadingScreen.js', () => ({
  getLoadingScreenState: () => loading,
  showLoadingScreen: vi.fn(() => { loading.visible = true; return ++loading.session }),
  hideLoadingScreen: vi.fn(() => { loading.visible = false }),
  waitForLoadingPaint: vi.fn(async() => {})
}))

function makeLoop(running = true) {
  const loop = { running }
  loop.stop = vi.fn(() => { loop.running = false })
  loop.start = vi.fn(() => { loop.running = true })
  window.gameInstance = { gameLoop: loop }
  return loop
}

describe('runtime graphics preparation', () => {
  beforeEach(() => { loading.visible = false; vi.clearAllMocks() })

  it('[U07074] suspends rendering until overlapping preparations both finish and resumes only once', async() => {
    const loop = makeLoop()
    let releaseA, releaseB
    const a = withPreparedRendering(() => new Promise(resolve => { releaseA = resolve }), loop)
    const b = withPreparedRendering(() => new Promise(resolve => { releaseB = resolve }), loop)
    await vi.waitFor(() => expect(releaseB).toBeTypeOf('function'))
    expect(loop.running).toBe(false)
    expect(loading.visible).toBe(true)
    releaseA('first')
    expect(await a).toBe('first')
    expect(loop.start).not.toHaveBeenCalled()
    releaseB('second')
    expect(await b).toBe('second')
    expect(loop.start).toHaveBeenCalledTimes(1)
    expect(loop.stop).toHaveBeenCalledTimes(1)
    expect(loading.visible).toBe(false)
  })

  it('[U07075] releases suspension after failure without closing a loading session owned by its caller', async() => {
    const loop = makeLoop()
    loading.visible = true
    await expect(withPreparedRendering(async() => { throw new Error('upload failed') }, loop)).rejects.toThrow('upload failed')
    expect(loop.running).toBe(true)
    expect(loading.visible).toBe(true)
  })

  it('[U07076] preserves a stopped loop and never restarts one replaced during preparation', async() => {
    const stopped = makeLoop(false)
    await withPreparedRendering(async() => {}, stopped)
    expect(stopped.start).not.toHaveBeenCalled()
    const replaced = makeLoop()
    await withPreparedRendering(async() => { window.gameInstance.gameLoop = {} }, replaced)
    expect(replaced.start).not.toHaveBeenCalled()
  })
})
