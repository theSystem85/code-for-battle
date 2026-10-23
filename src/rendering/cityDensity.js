// Layout preparation only. Density describes the architecture, independently
// of the image height and the physical ground rectangle.
export function getCityBuildingDensity(group) {
  let density = 0
  for (const tag of group.tagSet) {
    const match = /^density_(10|[1-9])$/.exec(tag)
    if (match) density = Math.max(density, Number(match[1]))
  }
  // Untagged user sheets retain their original small/medium/large ordering,
  // while remaining eligible in villages. Explicit tags opt into the scale.
  return density || Math.min(3, Math.max(group.width, group.height))
}

export function getCityMaximumDensity(index) {
  return [3, 7, 7, 10][index % 4]
}

export function getCityDensityLimit(maximum, radius) {
  // Keep a usable core around curved streets so a large tower still gets a
  // central lot when the very nearest street tile cannot fit its base.
  const taper = Math.min(1, Math.max(0, (radius - 0.2) / 0.8))
  return Math.max(1, Math.ceil(maximum * (1 - taper)))
}
