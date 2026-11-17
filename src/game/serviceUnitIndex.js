const EMPTY = []

export function normalizeServiceOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

export class ServiceUnitIndex {
  constructor() {
    this.ambulances = []
    this.tankers = []
    this.recoveryTanks = []
    this.byId = new Map()
    this.byOwner = new Map()
    this.pool = []
  }

  rebuild(units) {
    this.ambulances.length = 0
    this.tankers.length = 0
    this.recoveryTanks.length = 0
    for (const list of this.byOwner.values()) {
      list.length = 0
      this.pool.push(list)
    }
    this.byOwner.clear()
    this.byId.clear()
    for (const unit of units) {
      if (!unit || unit.factoryExit) continue
      if (unit.type === 'ambulance') this.ambulances.push(unit)
      if (unit.type === 'recoveryTank') this.recoveryTanks.push(unit)
      if (unit.type === 'tankerTruck' && unit.health > 0) this.tankers.push(unit)
    }
    if (!this.ambulances.length && !this.tankers.length && !this.recoveryTanks.length) return this

    for (const unit of units) {
      if (!unit) continue
      if (!this.byId.has(unit.id)) this.byId.set(unit.id, unit)
      const owner = normalizeServiceOwner(unit.owner)
      let list = this.byOwner.get(owner)
      if (!list) {
        list = this.pool.pop() || []
        this.byOwner.set(owner, list)
      }
      list.push(unit)
    }
    return this
  }

  friendly(owner) {
    return this.byOwner.get(normalizeServiceOwner(owner)) || EMPTY
  }
}

export function lookupServiceUnit(serviceIndex, units, id) {
  return serviceIndex ? serviceIndex.byId.get(id) : units.find(unit => unit?.id === id)
}
