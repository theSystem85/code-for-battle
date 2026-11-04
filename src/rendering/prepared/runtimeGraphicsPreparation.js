import { getLoadingScreenState, showLoadingScreen, hideLoadingScreen, waitForLoadingPaint } from '../../ui/loadingScreen.js'

const suspended = new WeakMap()

// Configuration boundary only: stop both simulation and rendering while their
// shared map/catalog changes. Nested callers borrow the same suspension and
// loading session; they must not queue behind a loading task awaiting them.
export async function withPreparedRendering(task, loop = globalThis.window?.gameInstance?.gameLoop) {
  if (!loop) return task()
  let state = suspended.get(loop)
  if (!state) {
    state = { depth: 0, restart: loop.running, session: null }
    suspended.set(loop, state)
    loop.stop()
    if (!getLoadingScreenState().visible) {
      state.session = showLoadingScreen({ phase: 'map', detail: 'Preparing map graphics', progress: null })
    }
  }
  state.depth++
  try {
    if (state.session !== null) await waitForLoadingPaint()
    return await task()
  } finally {
    if (--state.depth === 0) {
      suspended.delete(loop)
      if (state.restart && globalThis.window?.gameInstance?.gameLoop === loop) loop.start()
      if (state.session !== null) hideLoadingScreen(state.session)
    }
  }
}
