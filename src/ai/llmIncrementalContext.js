/**
 * Versioned, no-envelope strategic context for long-lived LLM sessions.
 * Entity tables declare their columns once and carry compact positional rows.
 */
export const STRATEGIC_CONTEXT_VERSION = '1.0'

const TABLE_COLUMNS = Object.freeze({
  units: ['id', 'type', 'owner', 'health', 'maxHealth', 'x', 'y'],
  buildings: ['id', 'type', 'owner', 'health', 'maxHealth', 'x', 'y', 'width', 'height', 'complete']
})

function entityRows(input) {
  const units = (input.snapshot?.units || []).map(entity => [
    entity.id, entity.type, entity.owner, entity.health, entity.maxHealth,
    entity.tilePosition?.x, entity.tilePosition?.y
  ])
  const buildings = (input.snapshot?.buildings || []).map(entity => [
    entity.id, entity.type, entity.owner, entity.health, entity.maxHealth,
    entity.tilePosition?.x, entity.tilePosition?.y, entity.size?.width,
    entity.size?.height, entity.constructionFinished
  ])
  return { units, buildings }
}

function rowMap(rows) {
  return new Map(rows.map(row => [row[0], row]))
}

function changedRows(previous, current) {
  const before = rowMap(previous)
  const after = rowMap(current)
  const created = []
  const changed = []
  const destroyed = []
  for (const row of current) {
    const old = before.get(row[0])
    if (!old) created.push(row)
    else if (JSON.stringify(old) !== JSON.stringify(row)) changed.push(row)
  }
  for (const row of previous) {
    if (!after.has(row[0])) destroyed.push(row[0])
  }
  return { created, changed, destroyed }
}

function resourceRow(input) {
  const resources = input.snapshot?.resources || {}
  const power = resources.power || {}
  return [resources.money || 0, power.supply || 0, power.production || 0, power.consumption || 0]
}

function sameRow(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Create isolated incremental context state for one controlling player/session. */
export function createStrategicContextTracker() {
  let revision = 0
  let rows = null
  let resources = null

  return {
    reset() {
      revision = 0
      rows = null
      resources = null
    },

    build(input) {
      const nextRows = entityRows(input)
      const nextResources = resourceRow(input)
      const destroyedIds = new Set((input.transitions?.events || [])
        .filter(event => event.type === 'destroyed')
        .map(event => event.victimId))
      if (rows) {
        for (const table of ['units', 'buildings']) {
          const visibleIds = new Set(nextRows[table].map(row => row[0]))
          for (const previousRow of rows[table]) {
            const isRememberedEnemy = previousRow[2] !== input.playerId &&
              !visibleIds.has(previousRow[0]) && !destroyedIds.has(previousRow[0])
            if (isRememberedEnemy) nextRows[table].push(previousRow)
          }
        }
      }
      const fromRevision = revision
      revision += 1

      if (!rows) {
        rows = nextRows
        resources = nextResources
        return {
          contextVersion: STRATEGIC_CONTEXT_VERSION,
          mode: 'initial',
          revision,
          playerId: input.playerId,
          tick: input.tick,
          map: [input.meta?.tilesX, input.meta?.tilesY],
          resources: { columns: ['money', 'powerSupply', 'powerProduction', 'powerConsumption'], rows: [nextResources] },
          units: { columns: TABLE_COLUMNS.units, rows: nextRows.units },
          buildings: { columns: TABLE_COLUMNS.buildings, rows: nextRows.buildings },
          constraints: input.constraints
        }
      }

      const unitDelta = changedRows(rows.units, nextRows.units)
      const buildingDelta = changedRows(rows.buildings, nextRows.buildings)
      const resourceChanged = !sameRow(resources, nextResources)
      rows = nextRows
      resources = nextResources
      return {
        contextVersion: STRATEGIC_CONTEXT_VERSION,
        mode: 'delta',
        fromRevision,
        revision,
        tick: input.tick,
        changes: {
          units: { columns: TABLE_COLUMNS.units, ...unitDelta },
          buildings: { columns: TABLE_COLUMNS.buildings, ...buildingDelta },
          resources: resourceChanged
            ? { columns: ['money', 'powerSupply', 'powerProduction', 'powerConsumption'], rows: [nextResources] }
            : null,
          events: (input.transitions?.events || []).map(event => ({ ...event }))
        }
      }
    },

    query({ entityId, region, maxRows = 100 } = {}) {
      if (!rows) return { revision, units: [], buildings: [], truncated: false }
      const boundedMax = Math.max(1, Math.min(500, Number(maxRows) || 100))
      const inRegion = row => !region || (
        row[5] >= region.x && row[5] < region.x + region.width &&
        row[6] >= region.y && row[6] < region.y + region.height
      )
      const select = table => table.filter(row => (!entityId || row[0] === entityId) && inRegion(row))
      const all = [...select(rows.units), ...select(rows.buildings)]
      return {
        revision,
        columns: TABLE_COLUMNS,
        rows: all.slice(0, boundedMax),
        truncated: all.length > boundedMax
      }
    }
  }
}
