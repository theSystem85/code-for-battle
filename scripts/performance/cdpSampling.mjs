export async function startCpuSampling(context, { interval = 1000, label = 'steady' } = {}) {
  const page = context.pages()[0]
  if (!page) throw new Error('A page is required before starting CDP sampling')
  const session = await context.newCDPSession(page)
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval })
  await session.send('Profiler.start')
  return { session, label, startedAt: Date.now() }
}

export async function stopCpuSampling(capture) {
  if (!capture?.session) throw new Error('A sampling capture is required')
  const result = await capture.session.send('Profiler.stop')
  await capture.session.send('Profiler.disable').catch(() => {})
  return {
    label: capture.label,
    durationMs: Math.max(0, Date.now() - capture.startedAt),
    profilingOverhead: 'CDP CPU sampling is intrusive diagnostic instrumentation; do not use it for FPS certification.',
    profile: result.profile || null
  }
}

