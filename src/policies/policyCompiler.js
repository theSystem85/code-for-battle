// Compilation happens at accepted revision boundaries, never during stepping.
import { compareValues, compareTolerance, conditionNeeds, defaultParams, effectiveMode, leafMeta, NUMERIC_FIELDS } from './policyConditions.js'
import { validatePolicy } from './policySchema.js'
import { effectNeedsEnemy } from './policyEffects.js'
import { stepPolicy } from './policyStep.js'

export const COMPILED_PROGRAM_VERSION = 1
const preparedStepOptions = new WeakMap()
const compiledConditionOffsets = new WeakMap()

function compileCondition(condition, instructions) {
  const offset = instructions.length
  const meta = leafMeta(condition)
  const leaf = meta ? Object.freeze({ ...defaultParams(meta), ...condition, ...(condition.type === 'compare' ? { mode: effectiveMode(condition) } : {}) }) : condition
  const node = {
    opcode: condition.type, leaf, children: [],
    tolerance: condition.type === 'compare' ? compareTolerance(condition) : 0,
    circular: condition.type === 'compare' && Boolean(NUMERIC_FIELDS[condition.field]?.circular) && effectiveMode(condition) === 'absolute'
  }
  instructions.push(node)
  if (condition.type === 'not') node.children.push(compileCondition(condition.of, instructions))
  if (condition.type === 'and' || condition.type === 'or') {
    for (const child of condition.of) node.children.push(compileCondition(child, instructions))
  }
  Object.freeze(node.children)
  Object.freeze(node)
  return offset
}

export function evaluateCompiledCondition(instructions, offset, view) {
  const node = instructions[offset]
  switch (node.opcode) {
    case 'always': return true
    case 'enemyInRange': return view.enemyInRange === true
    case 'underFire': return view.underFire === true
    case 'not': return !evaluateCompiledCondition(instructions, node.children[0], view)
    case 'and':
      for (const child of node.children) if (!evaluateCompiledCondition(instructions, child, view)) return false
      return true
    case 'or':
      for (const child of node.children) if (evaluateCompiledCondition(instructions, child, view)) return true
      return false
    case 'compare': {
      const value = view.measure ? view.measure(node.leaf) : view[node.leaf.field]
      return typeof value === 'number' && !Number.isNaN(value) && compareValues(value, node.leaf.op, node.leaf.value, node.tolerance, node.circular)
    }
    case 'check': return view.measure ? view.measure(node.leaf) === true : false
    default: return false
  }
}

function freezeTree(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child)
    Object.freeze(value)
  }
  return value
}

export function compilePolicyProgram(policy, metadata = {}) {
  const validation = validatePolicy(policy)
  if (!validation.valid) {
    const error = new Error(validation.errors[0].message)
    error.errors = validation.errors
    throw error
  }
  const document = freezeTree(globalThis.structuredClone(policy))
  const stateTable = Object.create(null)
  const ruleTable = Object.create(null)
  const conditionInstructions = []
  const conditionOffsets = new Map()
  const stateOffsets = Object.create(null)
  const dependencies = { enemy: false }
  document.states.forEach((state, offset) => { stateOffsets[state.id] = offset })
  document.states.forEach(state => {
    if (effectNeedsEnemy(state.effect)) dependencies.enemy = true
    stateTable[state.id] = state
    for (const rule of state.transitions || []) {
      conditionNeeds(rule.when, dependencies)
      conditionNeeds(rule.until, dependencies)
      conditionOffsets.set(rule.when, compileCondition(rule.when, conditionInstructions))
      if (rule.until) conditionOffsets.set(rule.until, compileCondition(rule.until, conditionInstructions))
      ruleTable[rule.id] = Object.freeze({ rule, targetOffset: stateOffsets[rule.to], elseOffset: rule.elseTo == null ? null : stateOffsets[rule.elseTo] })
    }
  })
  const program = Object.freeze({
    version: COMPILED_PROGRAM_VERSION,
    automationId: policy.id,
    behaviorRevision: metadata.behaviorRevision || 1,
    languageVersion: metadata.languageVersion || 1,
    catalogVersion: metadata.catalogVersion || 1,
    sourceIdentity: metadata.sourceIdentity || policy.source || JSON.stringify(policy),
    policy: document,
    initialStateOffset: stateOffsets[document.initialStateId],
    stateTable: Object.freeze(stateTable),
    ruleTable: Object.freeze(ruleTable),
    stateIndexToInternalId: Object.freeze(document.states.map(state => state.id)),
    conditionInstructions: Object.freeze(conditionInstructions),
    sensorDependencyMask: dependencies.enemy ? 1 : 0
  })
  const gates = Object.create(null)
  for (const gate of ['open', 'orderRunning', 'paused']) gates[gate] = Object.freeze({ gate, program, evaluate: evaluatePrepared })
  preparedStepOptions.set(program, gates)
  compiledConditionOffsets.set(program, conditionOffsets)
  return program
}

function evaluatePrepared(condition, view, program) {
  if (condition.type === 'always') return true
  if (condition.type === 'enemyInRange') return view.enemyInRange === true
  if (condition.type === 'underFire') return view.underFire === true
  return evaluateCompiledCondition(program.conditionInstructions, compiledConditionOffsets.get(program).get(condition), view)
}

export function stepCompiledPolicy(program, runtime, view, options) {
  const gate = typeof options === 'string' ? options : options?.gate || 'open'
  return stepPolicy(program.policy, runtime, view, preparedStepOptions.get(program)[gate])
}
