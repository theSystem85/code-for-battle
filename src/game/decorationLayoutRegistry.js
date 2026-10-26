// Prepared decoration layouts, shared by city simulation and placement checks.
// This module stays free of building and renderer imports so placement
// validation can read the layout without a circular module load.

const layouts = new WeakMap()

export function registerDecorationLayout(mapGrid, layout) {
  if (!mapGrid) return
  if (layout) layouts.set(mapGrid, layout)
  else layouts.delete(mapGrid)
}

export function getRegisteredDecorationLayout(mapGrid) {
  return layouts.get(mapGrid) || null
}
