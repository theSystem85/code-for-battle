import { handleMultiplayerStatsRequest, readRuntimeRedisEnv, statsDebugEnabled, statsRoute } from '../../src/network/multiplayerStats.js'

async function forwardToBlobs(request) {
  const url = new URL(request.url)
  const route = statsRoute(url.pathname)
  url.pathname = route === 'quick-match'
    ? '/.netlify/functions/api/quick-match'
    : '/.netlify/functions/api/presence'
  const headers = new Headers(request.headers)
  headers.delete('host')
  const body = await request.text()
  const response = await fetch(url, {
    method: request.method,
    headers,
    body: body || undefined
  })
  const text = await response.text()
  const debug = statsDebugEnabled()
  let nextBody = text
  if (debug) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.handler = 'edge-forward'
        nextBody = JSON.stringify(parsed)
      }
    } catch {
      // Keep a non-JSON function response unchanged.
    }
  }
  const responseHeaders = new Headers(response.headers)
  if (debug) responseHeaders.set('x-cfb-stats-handler', 'edge-forward')
  responseHeaders.delete('content-length')
  return new Response(nextBody, { status: response.status, statusText: response.statusText, headers: responseHeaders })
}

function readEdgeRedis() {
  let url = ''
  let token = ''
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && typeof Netlify.env.get === 'function') {
      try {
        url = Netlify.env.get('UPSTASH_REDIS_REST_URL') || ''
      } catch {
        // An unset key throws. A configured secret should return a string.
      }
      try {
        token = Netlify.env.get('UPSTASH_REDIS_REST_TOKEN') || ''
      } catch {
        // Same as the URL read.
      }
    }
  } catch {
    // The Netlify global is missing outside the edge runtime.
  }
  return readRuntimeRedisEnv({
    UPSTASH_REDIS_REST_URL: typeof url === 'string' ? url : '',
    UPSTASH_REDIS_REST_TOKEN: typeof token === 'string' ? token : ''
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
  const redis = readEdgeRedis()
  if (!redis) return forwardToBlobs(request)
  return handleMultiplayerStatsRequest(request, {
    env: {
      UPSTASH_REDIS_REST_URL: redis.url,
      UPSTASH_REDIS_REST_TOKEN: redis.token
    },
    fetchImpl: fetch,
    now: () => Date.now(),
    handler: 'edge'
  })
}

export const config = {
  path: ['/api/presence', '/api/quick-match']
}
