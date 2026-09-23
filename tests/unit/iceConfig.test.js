import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  buildJoinFailureHint,
  countCandidateSummaries,
  describeIceUrl,
  summarizeIceCandidate,
  waitForIceGathering
} from '../../src/network/iceConfig.js'
import { buildIceServerPayload, createEphemeralTurnCredential } from '../../src/network/turnCredentials.js'
import { shouldBypassServiceWorkerCache } from '../../src/pwa/serviceWorkerCachePolicy.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('ICE candidate summaries', () => {
  it('classifies host, mDNS, srflx, and relay lines without returning addresses', () => {
    const host = summarizeIceCandidate('candidate:1 1 udp 2122260223 192.168.1.8 54000 typ host')
    const mdns = summarizeIceCandidate('candidate:2 1 udp 2122260223 a1b2c3d4-5678-90ab.local 9 typ host')
    const srflx = summarizeIceCandidate('candidate:3 1 udp 1686052607 203.0.113.8 20000 typ srflx raddr 0.0.0.0 rport 0')
    const relay = summarizeIceCandidate({ candidate: 'candidate:4 1 tcp 41885439 203.0.113.9 443 typ relay' })

    expect(host).toMatchObject({ type: 'host', protocol: 'udp', mdns: false, privateOrLoopback: true })
    expect(mdns).toMatchObject({ type: 'host', mdns: true, privateOrLoopback: true })
    expect(srflx).toMatchObject({ type: 'srflx', privateOrLoopback: false })
    expect(relay).toMatchObject({ type: 'relay', protocol: 'tcp' })
    expect(JSON.stringify({ host, mdns, srflx, relay })).not.toContain('192.168.1.8')
    expect(JSON.stringify({ host, mdns, srflx, relay })).not.toContain('203.0.113.8')
  })

  it('parses JSON-encoded candidate payloads from the signalling store', () => {
    const summary = summarizeIceCandidate(JSON.stringify({
      candidate: 'candidate:1 1 udp 1 10.1.1.4 9 typ host',
      sdpMid: '0'
    }))
    expect(summary).toMatchObject({ type: 'host', privateOrLoopback: true, mdns: false })
  })

  it('counts candidate types for join diagnostics', () => {
    const counts = countCandidateSummaries([
      { candidate: 'candidate:1 1 udp 1 example.local 9 typ host' },
      { candidate: 'candidate:2 1 udp 1 203.0.113.10 9 typ srflx' },
      { candidate: 'candidate:3 1 udp 1 203.0.113.11 9 typ relay' }
    ])
    expect(counts).toMatchObject({ total: 3, host: 1, srflx: 1, relay: 1, mdns: 1 })
  })

  it('redacts TURN userinfo when describing a URL', () => {
    expect(describeIceUrl('turns:user:pass@turn.example.com:443?transport=tcp')).toEqual({
      scheme: 'turns',
      host: 'turn.example.com:443'
    })
  })

  it('explains a missing TURN relay in the player-facing hint', () => {
    expect(buildJoinFailureHint({ turnConfigured: false, stats: { relay: 0, mdns: 2 } }))
      .toContain('No TURN server is configured')
    expect(buildJoinFailureHint({ turnConfigured: true, stats: { relay: 0 } }))
      .toContain('no relay candidates')
  })
})

describe('TURN credentials', () => {
  it('mints coturn ephemeral credentials without embedding the shared secret', () => {
    const secret = 'coturn-shared-secret'
    const now = 1_700_000_000
    const minted = createEphemeralTurnCredential(secret, 3600, now)
    expect(minted.username).toBe(`${now + 3600}:cfb`)
    expect(minted.credential).toBe(createHmac('sha1', secret).update(minted.username).digest('base64'))
    expect(minted.credential).not.toBe(secret)

    const payload = buildIceServerPayload({
      TURN_URLS: 'turn:turn.example.com:3478?transport=udp, turns:turn.example.com:443?transport=tcp, http://evil.example',
      TURN_SECRET: secret
    })
    expect(payload.turnConfigured).toBe(true)
    expect(payload.credentialMode).toBe('ephemeral')
    expect(payload.turnHosts).toEqual(['turn.example.com:3478', 'turn.example.com:443'])
    expect(payload.iceServers[1].username).toMatch(/:cfb$/)
    expect(JSON.stringify(payload.turnHosts)).not.toContain(secret)
  })

  it('uses static credentials only when both username and password are set', () => {
    expect(buildIceServerPayload({ TURN_URLS: 'turn:turn.example.com:3478' }).turnConfigured).toBe(false)
    const payload = buildIceServerPayload({
      TURN_URLS: 'turn:turn.example.com:3478',
      TURN_USERNAME: 'player',
      TURN_CREDENTIAL: 'password'
    })
    expect(payload.credentialMode).toBe('static')
    expect(payload.iceServers[1]).toMatchObject({ username: 'player', credential: 'password' })
  })
})

describe('ICE gathering wait', () => {
  it('resolves immediately when the peer connection does not report gathering state', async() => {
    await expect(waitForIceGathering({})).resolves.toBeUndefined()
  })

  it('resolves when gathering completes before the timeout', async() => {
    const listeners = {}
    const pc = {
      iceGatheringState: 'gathering',
      addEventListener(name, handler) { listeners[name] = handler },
      removeEventListener(name) { delete listeners[name] }
    }
    const pending = waitForIceGathering(pc, 5000)
    pc.iceGatheringState = 'complete'
    listeners.icegatheringstatechange()
    await expect(pending).resolves.toBeUndefined()
  })
})

describe('service worker signalling bypass', () => {
  it('does not cache signalling API reads', () => {
    expect(shouldBypassServiceWorkerCache('/api/signalling/pending/token?_t=1', 'GET')).toBe(true)
    expect(shouldBypassServiceWorkerCache('https://code-for-battle.netlify.app/api/signalling/ice-servers', 'GET')).toBe(true)
    expect(shouldBypassServiceWorkerCache('/images/map/buildings/yard.webp', 'GET')).toBe(false)
    const worker = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8')
    expect(worker).toContain("pathname.startsWith('/api/')")
    expect(worker).toContain('code-for-battle-cache-v2')
  })
})
