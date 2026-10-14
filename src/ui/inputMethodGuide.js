import './inputMethodGuide.css'
import { keybindingManager } from '../input/keybindings.js'
import { gamepadMonitor } from '../input/gamepad/gamepadMonitor.js'
import { getGamepadStore } from '../input/gamepad/gamepadStore.js'
import { resolveGamepadBindings } from '../input/gamepad/gamepadProfiles.js'

export const INPUT_METHODS = Object.freeze([
  { id: 'mouse-keyboard', label: 'Mouse + keyboard', icon: '🖱', caption: 'Point, click and use shortcuts' },
  { id: 'touch', label: 'Touch', icon: '☝', caption: 'Tap and use two-finger gestures' },
  { id: 'trackpad', label: 'Trackpad', icon: '▱', caption: 'Click and scroll with two fingers' },
  { id: 'gamepad', label: 'Gamepad', icon: '🎮', caption: 'Use your controller profile' }
])

export function isInputMethod(value) {
  return INPUT_METHODS.some(method => method.id === value)
}

function binding(device, id, fallback) {
  return keybindingManager.getBindingsByDevice(device).find(item => item.id === id)?.input || fallback
}

export function pointerInputLabel(value) {
  return value.replace(/Mouse1/g, 'Primary click').replace(/Mouse2/g, 'Secondary click').replace(/Mouse3/g, 'Middle click').replace(/Double /g, 'Double ').replace(/\+/g, ' + ')
}

export function gamepadInputLabel(input, standard = false) {
  if (!input) return 'Unbound — configure in Settings'
  if (input.type === 'button') {
    const standardNames = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'Left bumper', 'Right bumper', 'Left trigger', 'Right trigger', 'Back / View', 'Start / Menu', 'Left stick click', 'Right stick click', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right']
    return `${standard && standardNames[input.index] ? `${standardNames[input.index]} · ` : ''}Button ${input.index}`
  }
  const axisNames = ['Left stick horizontal', 'Left stick vertical', 'Right stick horizontal', 'Right stick vertical']
  return `${standard && axisNames[input.index] ? `${axisNames[input.index]} · ` : ''}Axis ${input.index}${input.sign === -1 ? ' −' : input.sign === 1 ? ' +' : ''}`
}

/** Read mappings only when a guide is opened/refreshed, never from a simulation tick. */
export function getInputGuideData(method) {
  const primary = pointerInputLabel(binding('mouse', 'select', 'Mouse1'))
  const additive = pointerInputLabel(binding('mouse', 'select-add', 'Shift+Mouse1'))
  const escape = binding('keyboard', 'escape', 'Escape')
  const driving = ['remote-forward', 'remote-backward', 'remote-left', 'remote-right'].map(id => binding('keyboard', id, 'Unbound')).join(' / ')
  const fire = binding('keyboard', 'remote-fire', 'Space')
  const settingsKey = binding('keyboard', 'toggle-help', 'i')
  if (method === 'gamepad') {
    const store = getGamepadStore()
    const live = gamepadMonitor.slots[0]
    const remembered = (store.assignments || []).find(item => item.slot === 0)
    const identity = live?.connected ? live : remembered
    const resolved = resolveGamepadBindings(store, { slot: 0, instanceKey: identity?.instanceKey || '', gamepadId: identity?.id || '' })
    const label = id => gamepadInputLabel(resolved.bindings[id], live?.connected && live.mapping === 'standard')
    return {
      title: 'Gamepad controls',
      note: live?.connected ? `Player 1 · ${live.id}. These controls include the active player, controller-type and device profiles.` : 'Player 1 profile. Connect your controller and press a button, then refresh mappings. Button numbers remain accurate for the resolved profile; controller face labels appear only for a connected standard controller.',
      rows: [
        ['Point', `${label('cursorX')} / ${label('cursorY')}`, 'Move the on-screen pointer in pointer mode.'],
        ['Select / order', label('leftClick'), 'Click a unit to select; click ground to move or an enemy to attack.'],
        ['Group select', `Hold ${label('leftClick')}`, 'Drag the pointer around several units, then release.'],
        ['Deselect / cancel', label('rightClick'), 'Secondary click without dragging clears selection.'],
        ['Pan map', `${label('mapScrollX')} / ${label('mapScrollY')}`, 'Move the camera in pointer mode.'],
        ['Manual driving', label('remoteStickMode'), `Toggle remote stick mode for a selected unit. Drive with ${label('remoteMoveX')} / ${label('remoteMoveY')}; fire with ${label('fire')}.`]
      ]
    }
  }
  if (method === 'touch') return {
    title: 'Touch controls',
    note: 'Your choice changes tutorial guidance. Other connected input devices keep working.',
    rows: [
      ['Select', binding('touch', 'tap-select', 'Tap'), 'Tap a friendly unit.'],
      ['Group select', 'One-finger selection box', 'Drag around units, or tap units to add them.'],
      ['Move / attack', 'Tap a destination / enemy', 'With units selected, tap ground to move or an enemy to attack.'],
      ['Deselect', binding('touch', 'two-finger-tap', 'Double Finger Tap'), 'Tap with two fingers without dragging.'],
      ['Pan map', 'Two-finger drag', 'Move both fingers together. Invert touch/trackpad panning in Runtime Config → Controls if desired.'],
      ['Manual driving', 'On-screen joystick', 'Select a controllable unit, then use its joystick and fire controls.']
    ]
  }
  const rows = [
    ['Select / order', primary, 'Click a unit to select; click ground to move or an enemy to attack.'],
    ['Group select', `Drag ${primary} / ${additive}`, 'Drag a box around units; add individual units with the additive selection binding.'],
    ['Deselect / cancel', `${escape} / Secondary click`, 'Press the cancel key or secondary-click without dragging.'],
    ['Pan map', method === 'trackpad' ? 'Two-finger scroll ↔ ↕' : 'Secondary-click + drag', method === 'trackpad' ? 'Scroll with two fingers over the map. Shift + wheel scrolls horizontally. Hold a secondary click and drag if scrolling gestures are intercepted. In Runtime Config → Controls, invert touch/trackpad panning if desired.' : 'Hold the secondary button and drag. You can also scroll over the map.'],
    ['Manual driving', driving, `With a unit selected, hold the configured driving keys; fire with ${fire}. Without a selected unit, these direction keys move the camera.`],
    ['Control settings', settingsKey, 'Open Settings to inspect or customize bindings.']
  ]
  return {
    title: method === 'trackpad' ? 'Trackpad controls' : 'Mouse + keyboard controls',
    note: method === 'trackpad' ? 'A two-finger click or tap is the usual secondary click; enable it in your trackpad settings. On macOS, System Settings → Trackpad → More Gestures → Swipe between pages can intercept sideways gestures before the game receives them. Disable that gesture or use the secondary-click + drag fallback. The game cannot override operating-system gestures.' : 'These shortcut labels follow your current keybindings. Your choice changes guidance, not which devices can play.',
    rows
  }
}

export function inputAwareStepText(step, method) {
  if (!isInputMethod(method)) return null
  const data = getInputGuideData(method)
  const row = action => data.rows.find(item => item[0] === action)?.[1]
  const primary = pointerInputLabel(binding('mouse', 'select', 'Mouse1'))
  const escape = binding('keyboard', 'escape', 'Escape')
  const touch = method === 'touch'
  const gamepad = method === 'gamepad'
  const select = gamepad ? `${row('Select / order')} with the on-screen pointer` : touch ? 'tap' : primary
  switch (step.id) {
    case 'select-single': return `To select a friendly unit, ${select}. Its status appears and commands become available.`
    case 'select-group': return gamepad ? `Hold ${row('Select / order')} and move the pointer to drag a selection box around at least two units, then release.` : touch ? 'Drag a one-finger selection box around at least two units, or tap units one by one to add them. Two fingers pan the map.' : `Drag ${primary} to draw a selection box around multiple units. Use ${pointerInputLabel(binding('mouse', 'select-add', 'Shift+Mouse1'))} to add units. Shift-drag keeps additive selection.`
    case 'deselect': return touch ? 'Tap with two fingers without dragging to clear the current selection.' : gamepad ? `Use ${row('Deselect / cancel')} without dragging to clear selection.` : `Press ${escape}, or use a secondary click without dragging, to clear selection. On a trackpad, use the configured two-finger secondary click.`
    case 'move-units': return `Select a unit, then ${select} on empty ground to move it. ${touch ? 'Pan with two fingers.' : gamepad ? `Pan using ${row('Pan map')}.` : method === 'trackpad' ? 'Pan with two-finger scrolling or a secondary-click drag.' : 'Pan with a secondary-button drag.'}`
    case 'attack': return `Select a tank, then ${select} on an enemy to attack it. Destroy all enemy buildings to win.`
    case 'tank-rally': return `Queue a Tank, select the Vehicle Factory using ${select}, then use the same input on the map to set its rally point.`
    case 'build-harvester': return `Queue a Harvester. It automatically finds ore; select it and ${select} on an ore patch to direct it there.`
    case 'tank-control': return `Select a tank and order it to move. ${gamepad ? `Toggle ${row('Manual driving')} to enter remote stick mode; use the mapped movement axes and fire control shown in the controls guide.` : touch ? 'Use the on-screen joystick and fire controls to drive it manually.' : `Drive manually with ${row('Manual driving')} and fire with ${binding('keyboard', 'remote-fire', 'Space')}.`}`
    default: return null
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

/** Small static device diagrams keep gesture direction and mapped controls
 * visible alongside the instructions. Text stays selectable and readable. */
function createControlSchematic(method, data) {
  const figure = element('figure', `input-method-guide__schematic input-method-guide__schematic--${method}`)
  const device = element('div', 'input-method-guide__device')
  device.setAttribute('aria-hidden', 'true')
  const mappings = element('div', 'input-method-guide__diagram-labels')
  const row = action => data.rows.find(item => item[0] === action)?.[1] || ''
  let labels
  if (method === 'trackpad' || method === 'touch') {
    device.append(element('span', 'input-method-guide__finger input-method-guide__finger--one'), element('span', 'input-method-guide__finger input-method-guide__finger--two'), element('span', 'input-method-guide__gesture-arrows', '↔ ↕'))
    labels = method === 'trackpad'
      ? [['↔ ↕', 'Two-finger scroll pans the map'], ['● ●', 'Two-finger click: secondary click'], ['☝', 'Hold secondary click and drag: fallback pan']]
      : [['●', 'Tap: select / order'], ['● ● ↔ ↕', 'Two-finger drag: pan map'], ['● ●', 'Two-finger tap: deselect']]
  } else if (method === 'gamepad') {
    device.append(element('span', 'input-method-guide__gamepad-stick input-method-guide__gamepad-stick--left', '+'), element('span', 'input-method-guide__gamepad-stick input-method-guide__gamepad-stick--right', '●'))
    labels = [['Select', row('Select / order')], ['Cancel', row('Deselect / cancel')], ['Camera', row('Pan map')]]
  } else {
    device.append(element('span', 'input-method-guide__mouse-button', '1'), element('span', 'input-method-guide__mouse-button', '2'))
    labels = [['Pointer', row('Select / order')], ['Cancel', row('Deselect / cancel')], ['Drive', row('Manual driving')]]
  }
  for (const [key, value] of labels) {
    const line = element('div', 'input-method-guide__diagram-label')
    line.append(element('strong', '', key), element('span', '', value))
    mappings.append(line)
  }
  figure.append(device, mappings)
  const caption = element('figcaption', '', method === 'gamepad' ? 'Controller schematic · labels follow the resolved Player 1 profile.' : method === 'trackpad' ? 'Trackpad gestures · two fingers scroll; secondary click depends on system settings.' : method === 'touch' ? 'Touchscreen gestures · one finger selects; two fingers pan.' : 'Mouse and keyboard · current mappings shown beside the pointer.')
  figure.append(caption)
  return figure
}

export function createInputMethodGuide({ selected = null, onChoose, onOpenSettings }) {
  const root = element('section', 'input-method-guide')
  root.hidden = true
  root.setAttribute('aria-label', 'Choose your input method')
  const choices = element('div', 'input-method-guide__choices')
  choices.setAttribute('role', 'group')
  choices.setAttribute('aria-label', 'Input method')
  const detail = element('div', 'input-method-guide__detail')
  detail.setAttribute('aria-live', 'polite')
  let current = selected
  const buttons = INPUT_METHODS.map(method => {
    const button = element('button', 'input-method-guide__choice')
    button.type = 'button'
    button.dataset.inputMethod = method.id
    button.setAttribute('aria-label', method.label)
    const icon = element('span', 'input-method-guide__icon', method.icon)
    icon.setAttribute('aria-hidden', 'true')
    button.append(icon, element('strong', '', method.label), element('small', '', method.caption))
    button.addEventListener('click', () => { update(method.id); onChoose(method.id) })
    return button
  })
  choices.append(...buttons)
  const actions = element('div', 'input-method-guide__actions')
  const settings = element('button', 'tutorial-button tutorial-button--ghost', 'Open control settings')
  settings.type = 'button'
  settings.addEventListener('click', () => onOpenSettings(current === 'gamepad' ? 'gamepads' : 'keybindings'))
  const refresh = element('button', 'tutorial-button tutorial-button--ghost', 'Refresh mappings')
  refresh.type = 'button'
  refresh.addEventListener('click', () => update(current))
  actions.append(settings, refresh)
  root.append(choices, detail, actions)
  for (const type of ['keydown', 'keyup', 'mousedown', 'pointerdown', 'touchstart']) root.addEventListener(type, event => event.stopPropagation())
  function update(method) {
    current = isInputMethod(method) ? method : null
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.inputMethod === current)))
    detail.replaceChildren()
    if (!current) { detail.append(element('p', '', 'Choose a method to see its controls, then Continue. You can switch devices at any time.')); return }
    const data = getInputGuideData(current)
    detail.append(element('h4', '', data.title), createControlSchematic(current, data), element('p', 'input-method-guide__note', data.note))
    const mappings = element('dl', 'input-method-guide__mappings')
    for (const [action, input, explanation] of data.rows) {
      const group = element('div', 'input-method-guide__mapping')
      group.append(element('dt', '', action), element('dd', '', ''))
      group.lastChild.append(element('kbd', '', input), element('span', '', explanation))
      mappings.append(group)
    }
    detail.append(mappings)
  }
  update(selected)
  return { element: root, update }
}
