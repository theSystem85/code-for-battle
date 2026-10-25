import { DECORATION_PART_KEYS, DECORATION_SETTINGS, syncDecorationSettings } from '../game/decorationSettings.js'

// Sidebar-only. Keeps the overall decorative-tile input and its parts in agreement
// while the player types. Map regeneration still waits for Apply.
export function bindDecorationCountInputs(root = document) {
  const inputFor = key => root.getElementById?.(key) || null
  const overall = inputFor('decorativeTileCount')
  if (!overall || overall.dataset.decorationSync === '1') return
  overall.dataset.decorationSync = '1'
  let ratioSnapshot = null
  const read = () => Object.fromEntries(Object.keys(DECORATION_SETTINGS).map(key => [key, inputFor(key)?.value]))
  const write = (settings, skip) => {
    for (const [key, value] of Object.entries(settings)) {
      const input = inputFor(key)
      if (!input || input === skip) continue
      if (String(input.value) !== String(value)) input.value = String(value)
    }
  }
  const onEdit = event => {
    const key = event.target?.id
    if (key !== 'decorativeTileCount' && !DECORATION_PART_KEYS.includes(key)) return
    const basis = key === 'decorativeTileCount' && ratioSnapshot ? ratioSnapshot : read()
    const next = syncDecorationSettings(basis, key, event.target.value)
    write(next, event.type === 'input' ? event.target : null)
  }
  overall.addEventListener('focus', () => { ratioSnapshot = read() })
  overall.addEventListener('blur', () => { ratioSnapshot = null })
  for (const key of [...DECORATION_PART_KEYS, 'decorativeTileCount']) {
    const input = inputFor(key)
    if (!input) continue
    input.addEventListener('input', onEdit)
    input.addEventListener('change', onEdit)
  }
}
