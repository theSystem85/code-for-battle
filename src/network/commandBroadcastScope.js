let unitCommandBroadcastSuppression = 0

// A composite map action already carries its movement/attack over the network.
export function withoutUnitCommandBroadcast(callback) {
  unitCommandBroadcastSuppression++
  try { return callback() } finally { unitCommandBroadcastSuppression-- }
}

export function unitCommandBroadcastSuppressed() { return unitCommandBroadcastSuppression > 0 }
