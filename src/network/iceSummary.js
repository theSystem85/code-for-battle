export function parseTurnUrls(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('turn:') || part.startsWith('turns:'))
}

export function describeIceUrl(url) {
  const value = String(url || '')
  const scheme = value.split(':')[0] || 'unknown'
  const withoutScheme = value.slice(scheme.length + 1).replace(/^\/\//, '')
  const hostPort = withoutScheme.split('/')[0].split('?')[0]
  const host = hostPort.includes('@') ? hostPort.split('@').pop() : hostPort
  return { scheme, host }
}

function isPrivateOrLoopback(address) {
  if (!address) return true
  const value = String(address).toLowerCase()
  if (value.endsWith('.local') || value === '::1' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) {
    return true
  }
  const parts = value.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  return false
}

export function summarizeIceCandidate(candidateInit) {
  let raw = candidateInit
  if (raw && typeof raw === 'object') {
    raw = raw.candidate || ''
  }
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      raw = JSON.parse(raw)?.candidate || ''
    } catch {
      raw = ''
    }
  }
  const match = String(raw || '').match(/candidate:(?:\S+\s+){2}(\S+)\s+\d+\s+(\S+)\s+\d+\s+typ\s+(\S+)/i)
  if (!match) {
    return { type: 'unknown', protocol: 'unknown', mdns: false, privateOrLoopback: false }
  }
  const protocol = match[1].toLowerCase()
  const address = match[2]
  const type = match[3].toLowerCase()
  const mdns = address.toLowerCase().endsWith('.local')
  return {
    type,
    protocol,
    mdns,
    privateOrLoopback: mdns || isPrivateOrLoopback(address)
  }
}

export function countCandidateSummaries(candidates) {
  const counts = {
    total: 0,
    host: 0,
    srflx: 0,
    relay: 0,
    prflx: 0,
    mdns: 0,
    privateOrLoopback: 0,
    unknown: 0
  }
  for (const entry of candidates || []) {
    const summary = summarizeIceCandidate(entry?.candidate ?? entry)
    counts.total += 1
    if (summary.type === 'host' || summary.type === 'srflx' || summary.type === 'relay' || summary.type === 'prflx') {
      counts[summary.type] += 1
    } else {
      counts.unknown += 1
    }
    if (summary.mdns) counts.mdns += 1
    if (summary.privateOrLoopback) counts.privateOrLoopback += 1
  }
  return counts
}

export function emptyCandidateStats() {
  return { host: 0, srflx: 0, relay: 0, prflx: 0, mdns: 0, unknown: 0 }
}

export function recordCandidateStat(stats, candidateInit) {
  const summary = summarizeIceCandidate(candidateInit)
  if (!stats) return summary
  if (summary.type === 'host' || summary.type === 'srflx' || summary.type === 'relay' || summary.type === 'prflx') {
    stats[summary.type] += 1
  } else {
    stats.unknown += 1
  }
  if (summary.mdns) stats.mdns += 1
  return summary
}

export function isBenignIceError(err) {
  const message = String(err?.message || err || '').toLowerCase()
  return message.includes('duplicate') || message.includes('already')
}

export function safeAlias(alias) {
  return String(alias || '').replace(/[\r\n]/g, ' ').slice(0, 40)
}

export function summarizeIceServers(iceServers) {
  const summary = { stunCount: 0, turnCount: 0, hosts: [] }
  for (const server of iceServers || []) {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls]
    urls.filter(Boolean).forEach((url) => {
      const described = describeIceUrl(url)
      if (described.scheme.startsWith('turn')) {
        summary.turnCount += 1
        summary.hosts.push(described.host)
      } else if (described.scheme.startsWith('stun')) {
        summary.stunCount += 1
      }
    })
  }
  return summary
}
