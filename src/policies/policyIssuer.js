// Marks orders that come from a policy so they are not mistaken for direct orders.

let policyIssuing = 0

/** Run `fn` while orders it issues count as policy orders, not direct orders. */
export function runAsPolicy(fn) {
  policyIssuing += 1
  try {
    return fn()
  } finally {
    policyIssuing -= 1
  }
}

export function isPolicyIssuingOrder() {
  return policyIssuing > 0
}
