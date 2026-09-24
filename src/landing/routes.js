const DEV_REWRITES = {
  '/en/landing': '/src/landing/en.html',
  '/de/landing': '/src/landing/de.html',
  '/landing': '/src/landing/index.html'
}

const PREVIEW_REWRITES = {
  '/en/landing': '/en/landing.html',
  '/de/landing': '/de/landing.html',
  '/landing': '/landing.html'
}

export const LANDING_BUILD_MOVES = [
  ['src/landing/en.html', 'en/landing.html'],
  ['src/landing/de.html', 'de/landing.html'],
  ['src/landing/index.html', 'landing.html']
]

export function normalizeLandingPathname(pathname = '') {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function rewriteLandingPath(pathname, mode = 'dev') {
  const table = mode === 'preview' ? PREVIEW_REWRITES : DEV_REWRITES
  return table[normalizeLandingPathname(pathname)] || null
}

export function rewriteLandingUrl(url = '', mode = 'dev') {
  const [pathname, suffix = ''] = url.split(/(?=[?#])/, 2)
  const target = rewriteLandingPath(pathname, mode)
  return target ? `${target}${suffix}` : null
}
