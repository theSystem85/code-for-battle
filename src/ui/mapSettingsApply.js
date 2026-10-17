// Event-driven UI only: tracks pending sidebar map-setting edits and gates
// map regeneration behind an explicit Apply click.

const readValue = input => (input.type === 'checkbox' ? String(!!input.checked) : String(input.value ?? ''))

/**
 * Snapshot the given inputs and keep `button` disabled until at least one of
 * them differs from the snapshot. Reverting every edit disables it again.
 * Clicking the enabled button calls `onApply(changedField)` once; the
 * snapshot is re-taken after `onApply` settles unless it returns `false`
 * (the edits were not applied and stay pending).
 *
 * @param {object} options
 * @param {HTMLElement[]} options.inputs - inputs, selects and checkboxes to watch.
 * @param {HTMLButtonElement} options.button - the Apply button.
 * @param {(changedField: string|null) => (void|Promise<void>)} options.onApply
 * @param {(input: HTMLElement) => (string|null)} [options.fieldOf] - maps an input to the
 *   changedField hint passed to onApply (for example 'water' or 'rock').
 */
export function createMapSettingsApplyController({ inputs, button, onApply, fieldOf = () => null }) {
  const watched = (inputs || []).filter(Boolean)
  let snapshot = new Map()
  let changedField = null
  let applying = false

  const isDirty = () => watched.some(input => snapshot.get(input) !== readValue(input))
  const refresh = () => {
    if (!button) return
    const dirty = isDirty()
    button.disabled = applying || !dirty
    button.setAttribute('aria-disabled', String(button.disabled))
    button.dataset.pending = dirty ? 'true' : 'false'
  }
  const capture = () => new Map(watched.map(input => [input, readValue(input)]))
  // External resyncs (e.g. after a regeneration) are ignored while an Apply
  // is running; the Apply itself records exactly the values it applied.
  const resync = (values = null) => {
    if (applying && !values) return
    snapshot = values || capture()
    changedField = null
    refresh()
  }
  const onEdit = (event) => {
    const field = fieldOf(event.target)
    if (field) changedField = field
    refresh()
  }
  for (const input of watched) {
    input.addEventListener('input', onEdit)
    input.addEventListener('change', onEdit)
  }
  const apply = async() => {
    if (applying || !isDirty()) return false
    applying = true
    refresh()
    // Values edited while the map regenerates stay pending afterwards.
    const appliedValues = capture()
    const field = changedField
    let applied = false
    try {
      applied = (await onApply(field)) !== false
    } finally {
      applying = false
      if (applied) resync(appliedValues)
      else refresh()
    }
    return applied
  }
  if (button) button.addEventListener('click', apply)
  resync()
  return { apply, resync, refresh, isDirty, get pendingField() { return changedField } }
}
