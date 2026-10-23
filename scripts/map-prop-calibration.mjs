// Authored after reviewing all eight source images against dtv4 nature,
// dtv5 cottages and the 192px (3 map tile) vehicle factory. Values are source
// atlas pixels at 64px pitch; the game draws them at half size (32px pitch).
// Widths follow each source's reviewed semantic row order. Height bounds
// prevent narrow, tall art from growing disproportionately to its neighbors.
const natureWidths = [
  80, 76, 80, 76, 80,
  52, 36, 76, 84, 52,
  68, 60, 64, 60, 72,
  40, 44, 40, 44, 36,
  44, 40, 36, 32, 36,
  64, 60, 68, 76, 72,
  32, 36, 36, 32, 36,
  116, 128, 112, 148, 124
]
const widthsBySource = {
  alpha_grass: [
    180, 40, 116, 80, 44, 76, 112, 104,
    180, 42, 36, 92, 64, 44, 72, 64,
    42, 44, 116, 96, 104, 92, 80, 88
  ],
  alpha_soil: [
    176, 112, 58, 132, 56, 60, 88, 48,
    76, 76, 56, 104, 40, 48, 32, 36,
    32, 40, 36, 72, 96, 56, 100, 56
  ],
  alpha_sand: [
    96, 180, 60, 108, 88, 104, 44, 116,
    88, 52, 64, 100, 40, 40, 48, 28,
    40, 52, 36, 36, 80, 104, 88, 56
  ],
  alpha_snow: [
    96, 116, 116, 100, 108, 184, 60, 72,
    52, 92, 104, 44, 40, 40, 36, 52,
    52, 56, 36, 48, 76, 56, 44, 40
  ],
  alpha_universal: [
    128, 184, 116, 72, 168, 112, 60, 72,
    120, 64, 44, 36, 48, 36, 56, 36,
    72, 80, 48, 72, 60, 56, 80, 88
  ],
  alpha_shore: [
    36, 40, 44, 40, 36, 36,
    36, 36, 40, 40, 40, 36,
    56, 48, 44, 48, 52, 56,
    60, 116, 120, 120, 120, 56,
    40, 44, 40, 56, 56, 52,
    36, 40, 52, 56, 40, 48
  ],
  alpha_nature_grass: natureWidths,
  alpha_nature_soil: natureWidths
}

export function mapPropReferenceSize(profile, prop, index) {
  const widths = widthsBySource[profile.source]
  if (widths?.length !== profile.props.length) throw new Error(`Missing reviewed size guide: ${profile.source}`)
  const tags = prop.tags
  const height = profile.source === 'alpha_shore'
    ? tags.includes('shore_trans') && tags.includes('impassable') ? 88 : 56
    : profile.source.startsWith('alpha_nature_') ? tags.includes('water') ? 144 : tags.includes('trees') ? 124 : 80
      : tags.includes('water') ? 188 : tags.includes('trees') ? 124 : tags.includes('ruins') ? 160 : tags.includes('farm') && tags.includes('impassable') ? 152 : tags.includes('roadside') ? 120 : 100
  return { width: widths[index], height }
}

export function mapPropImportScale(bbox, referenceSize) {
  return Math.min(1, referenceSize.width / bbox.width, referenceSize.height / bbox.height)
}
