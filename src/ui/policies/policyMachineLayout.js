// Pure layout for the live state-machine view of one policy.
//
// States are stacked in a column. Every rule is drawn as an edge that leaves
// the right side of its source state, runs under its (wrapped) trigger text,
// travels down a private lane and re-enters the target state from the right.
// Keeping the text left of all lanes means no line ever crosses a label.

export const NODE_WIDTH = 150
export const NODE_MIN_HEIGHT = 46
export const LABEL_WIDTH = 190
export const LABEL_CHARS = 30
export const LINE_HEIGHT = 12
export const LANE_GAP = 12
export const NODE_GAP = 22
export const PADDING = 12
const ENTRY_STEP = 8
const ENTRY_TOP = 12
const SLOT_PAD = 8

/** Break `text` into lines of at most `maxChars`, preferring spaces and ")" / "," boundaries. */
export function wrapLabel(text, maxChars = LABEL_CHARS) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  const flush = () => {
    if (line) lines.push(line)
    line = ''
  }
  for (const word of words) {
    let rest = word
    while (rest.length > maxChars) {
      flush()
      lines.push(rest.slice(0, maxChars))
      rest = rest.slice(maxChars)
    }
    if (!line) line = rest
    else if (line.length + 1 + rest.length <= maxChars) line += ` ${rest}`
    else {
      flush()
      line = rest
    }
  }
  flush()
  return lines.length ? lines : ['']
}

/**
 * @param {object} policy validated policy document
 * @param {(transition: object) => string} describeTrigger full trigger text of a rule
 * @param {(state: object) => string} describeAction short text for what a state does
 */
export function layoutPolicyMachine(policy, describeTrigger, describeAction) {
  const states = policy.states || []
  const index = new Map(states.map((state, i) => [state.id, i]))

  const incoming = new Array(states.length).fill(0)
  states.forEach(state => {
    ;(state.transitions || []).forEach(transition => {
      const target = index.get(transition.to)
      if (target !== undefined) incoming[target] += 1
    })
  })

  const nodes = []
  const edges = []
  let y = PADDING
  let laneCount = 0
  const pendingEdges = []

  states.forEach((state, i) => {
    const entryZone = incoming[i] > 0 ? ENTRY_TOP + (incoming[i] - 1) * ENTRY_STEP : 8
    let slotY = y + entryZone
    const outgoing = []
    ;(state.transitions || []).forEach(transition => {
      if (!index.has(transition.to)) return
      const lines = wrapLabel(describeTrigger(transition))
      const extra = transition.kind === 'after' ? 1 : 0
      const height = (lines.length + extra) * LINE_HEIGHT + SLOT_PAD
      const edge = {
        id: transition.id,
        kind: transition.kind,
        from: state.id,
        to: transition.to,
        lines,
        delayLine: extra === 1,
        slotY,
        slotHeight: height,
        lane: laneCount
      }
      laneCount += 1
      slotY += height
      outgoing.push(edge)
      pendingEdges.push(edge)
    })
    const height = Math.max(NODE_MIN_HEIGHT, slotY - y + 4)
    nodes.push({
      id: state.id,
      name: state.name || state.id,
      action: describeAction ? describeAction(state) : '',
      initial: state.id === policy.initialStateId,
      x: PADDING,
      y,
      width: NODE_WIDTH,
      height,
      entrySeen: 0
    })
    edges.push(...outgoing)
    y += height + NODE_GAP
  })

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const labelX = PADDING + NODE_WIDTH + 10
  const laneStart = labelX + LABEL_WIDTH + 14
  edges.forEach(edge => {
    const from = nodeById.get(edge.from)
    const to = nodeById.get(edge.to)
    const startY = edge.slotY + edge.slotHeight - 3
    const entryY = to.y + 6 + to.entrySeen * ENTRY_STEP
    to.entrySeen += 1
    const laneX = laneStart + edge.lane * LANE_GAP
    const startX = from.x + from.width
    const endX = to.x + to.width
    edge.labelX = labelX
    edge.labelY = edge.slotY
    edge.path = `M${startX},${startY} H${laneX} V${entryY} H${endX + 2}`
    edge.laneX = laneX
  })

  return {
    width: laneStart + Math.max(0, laneCount - 1) * LANE_GAP + PADDING + 6,
    height: Math.max(y - NODE_GAP + PADDING, PADDING * 2 + NODE_MIN_HEIGHT),
    nodes,
    edges
  }
}
