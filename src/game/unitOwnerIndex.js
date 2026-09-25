// Reused per-owner unit lists for line-of-sight and friendly-tile checks.
// Rebuilt once per movement or combat pass. Callers must not keep the arrays.

const lists = new Map()
const pool = []
const EMPTY = []
let active = false

export function rebuildOwnerUnitIndex(units) {
  active = true
  for (const list of lists.values()) {
    list.length = 0
    pool.push(list)
  }
  lists.clear()
  if (!Array.isArray(units)) return
  for (let index = 0; index < units.length; index++) {
    const unit = units[index]
    const owner = unit?.owner
    if (!owner) continue
    let list = lists.get(owner)
    if (!list) {
      list = pool.pop() || []
      lists.set(owner, list)
    }
    list.push(unit)
  }
}

export function ownerUnitList(owner) {
  if (!active || !owner) return null
  return lists.get(owner) || EMPTY
}

export function resetOwnerUnitIndexForTests() {
  active = false
  for (const list of lists.values()) list.length = 0
  lists.clear()
  pool.length = 0
}
