let listing = {
  enabled: false,
  partyId: null,
  inviteToken: null
}

const listeners = new Set()

export function getOpenHostListing() {
  return listing
}

export function setOpenHostListing(next = {}) {
  listing = {
    enabled: next.enabled === true,
    partyId: next.partyId || null,
    inviteToken: next.inviteToken || null
  }
  listeners.forEach(listener => {
    try {
      listener(listing)
    } catch {
      // A checkbox sync must not break the listing.
    }
  })
  return listing
}

export function subscribeOpenHostListing(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}
