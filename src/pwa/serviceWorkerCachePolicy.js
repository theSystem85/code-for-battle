export function shouldBypassServiceWorkerCache(url, method = 'GET') {
  const verb = String(method || 'GET').toUpperCase()
  if (verb !== 'GET') return true
  let pathname = ''
  if (typeof url === 'string') {
    try {
      pathname = new URL(url, 'https://code-for-battle.local').pathname
    } catch {
      pathname = url
    }
  } else if (url && typeof url.pathname === 'string') {
    pathname = url.pathname
  }
  return pathname.startsWith('/api/') || pathname.startsWith('/.netlify/functions/')
}
