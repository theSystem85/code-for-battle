import { MAX_BUILDING_GAP_TILES } from '../config.js'
import { buildingData } from '../data/buildingData.js'

export function blueprintToFootprint(blueprint, owner) {
  if (!blueprint || !blueprint.type) {
    return null
  }
  const info = buildingData[blueprint.type]
  if (!info) {
    return null
  }

  return {
    type: blueprint.type,
    x: blueprint.x,
    y: blueprint.y,
    width: info.width,
    height: info.height,
    owner,
    blueprint
  }
}

export function mapBlueprintsToFootprints(blueprints, owner, options = {}) {
  const exclude = options.exclude || null
  return (Array.isArray(blueprints) ? blueprints : [])
    .filter(bp => !exclude || !exclude.has(bp))
    .map(bp => blueprintToFootprint(bp, owner))
    .filter(Boolean)
}

function areFootprintsNear(a, b, maxDistance = MAX_BUILDING_GAP_TILES) {
  for (let y1 = a.y; y1 < a.y + a.height; y1++) {
    for (let x1 = a.x; x1 < a.x + a.width; x1++) {
      for (let y2 = b.y; y2 < b.y + b.height; y2++) {
        for (let x2 = b.x; x2 < b.x + b.width; x2++) {
          if (Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) <= maxDistance) {
            return true
          }
        }
      }
    }
  }

  return false
}

export function isBlueprintConnectedToBase(targetBlueprint, blueprints, buildings, factories, owner, options = {}) {
  if (!targetBlueprint) {
    return false
  }

  const excluded = options.exclude || new Set()
  const target = blueprintToFootprint(targetBlueprint, owner)
  if (!target) {
    return false
  }

  const baseNodes = [
    ...(Array.isArray(factories) ? factories : []).filter(factory => factory && (factory.id === owner || factory.owner === owner)),
    ...(Array.isArray(buildings) ? buildings : []).filter(building => building && building.owner === owner)
  ]

  const plannedNodes = mapBlueprintsToFootprints(blueprints, owner, { exclude: excluded })
  const targetNode = plannedNodes.find(node => node.blueprint === targetBlueprint)
  if (!targetNode) {
    return false
  }

  const queue = [...baseNodes]
  const visitedPlans = new Set()

  while (queue.length > 0) {
    const source = queue.shift()
    plannedNodes.forEach(node => {
      if (visitedPlans.has(node.blueprint)) {
        return
      }

      if (areFootprintsNear(source, node)) {
        visitedPlans.add(node.blueprint)
        queue.push(node)
      }
    })
  }

  return visitedPlans.has(targetNode.blueprint)
}

export function getCascadingBlueprintCancellation(targetBlueprint, blueprints, buildings, factories, owner) {
  const ordered = Array.isArray(blueprints) ? blueprints : []
  const startIndex = ordered.indexOf(targetBlueprint)
  if (startIndex === -1) {
    return []
  }

  const toCancel = [targetBlueprint]
  const excluded = new Set(toCancel)

  for (let i = startIndex + 1; i < ordered.length; i++) {
    const candidate = ordered[i]
    if (!isBlueprintConnectedToBase(candidate, ordered, buildings, factories, owner, { exclude: excluded })) {
      toCancel.push(candidate)
      excluded.add(candidate)
    }
  }

  return toCancel
}
