import { handleMultiplayerStatsRequest, readRedisEnv, statsRoute } from '../../src/network/multiplayerStats.js'

function readNamedEnv(name) {
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      const value = Netlify.env.get(name)
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  } catch {
    // An unset key throws. A secret scoped to Functions and Runtime should not.
  }
  try {
    const deno = globalThis['Deno']
    if (deno && deno.env && typeof deno.env.get === 'function') {
      const value = deno.env.get(name)
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  } catch {
    // The edge runtime env is not the source for Netlify secrets.
  }
  if (typeof process !== 'undefined' && process.env && typeof process.env[name] === 'string') {
    return process.env[name].trim()
  }
  return ''
}

function readEdgeEnv() {
  return {
    UPSTASH_REDIS_REST_URL: readNamedEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: readNamedEnv('UPSTASH_REDIS_REST_TOKEN')
  }
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
