import { handleMultiplayerStatsRequest, readRedisEnv, statsRoute } from '../../src/network/multiplayerStats.js'

function readEdgeEnv() {
  const names = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
  const env = {}
  for (const name of names) {
    let value = ''
    try {
      if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
        value = Netlify.env.get(name) || ''
      }
    } catch {
      value = ''
    }
    if (!value && typeof process !== 'undefined' && process.env) {
      value = process.env[name] || ''
    }
    env[name] = value
  }
  return env
}

async function forwardToBlobs(request) {
  const url = new URL(request.url)
  const route = statsRoute(url.pathname)
  url.pathname = route === 'quick-match'
    ? '/.netlify/functions/api/quick-match'
    : '/.netlify/functions/api/presence'
  const headers = new Headers(request.headers)
  headers.delete('host')
  const body = await request.text()
  return fetch(url, {
    method: request.method,
    headers,
    body: body || undefined
  })
}

// Upstash is called with fetch from the edge runtime, which is the hot path.
// Netlify Blobs in this repo are opened with getStore inside the Node
// signalling function. That client is awkward in the edge bundle, so when
// UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing this function
// forwards once to the serverless function. Previews and local netlify dev
// keep working. Production with Upstash stays on the edge invocation quota.
export default async(request) => {
  const route = statsRoute(new URL(request.url).pathname)
  if (!route) return new Response('Not found', { status: 404 })
  if (!readRedisEnv(readEdgeEnv())) return forwardToBlobs(request)
  return handleMultiplayerStatsRequest(request, {
    env: readEdgeEnv(),
    fetchImpl: fetch,
    now: () => Date.now()
  })
}

export const config = {
  path: ['/api/presence', '/api/quick-match']
}
