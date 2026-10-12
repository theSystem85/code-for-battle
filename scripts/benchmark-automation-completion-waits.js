// Diagnostic only: fixed 150 ms cadence, no rendering or hardware FPS certification.
import { createCompletionReceipt, getCompletionReceipt } from '../src/policies/completionReceipts.js'
import { performance } from 'node:perf_hooks'
import { compilePolicyProgram, stepCompiledPolicy } from '../src/policies/policyCompiler.js'
import { createPolicyRuntime } from '../src/policies/policyStep.js'
import { POLICY_SCHEMA_VERSION } from '../src/policies/policySchema.js'
import { getUnitCompletionMetrics, resetUnitCompletionObjectives, unitCompletionStatus } from '../src/policies/unitCompletion.js'
const p = { schemaVersion: POLICY_SCHEMA_VERSION, id: 'waiting', name: 'Wait stress', variant: 'unit', scope: 'global', execution: 'continuous', initialStateId: 'watch',
  states: [{ id: 'watch', transitions: [{ id: 'start', kind: 'if', when: { type: 'always' }, to: 'act' }] },
    { id: 'act', effect: { type: 'attackNearestEnemy', waitForCompletion: true }, transitions: [] }] }
const program = compilePolicyProgram(p)
const productionProgram = compilePolicyProgram({ ...p, id: 'production', variant: 'build', states: [p.states[0], { id: 'act', effect: { type: 'buildBuilding', buildingType: 'powerPlant', waitForCompletion: true }, transitions: [] }] })
const target = { id: 'target', owner: 'player2', health: 100, type: 'tank' }
const units = Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, owner: 'player1', health: 100, target }))
const context = { units: units.concat(target), buildings: [] }
const objective = () => ({ kind: 'attack', ownerId: 'player1', target: { entityKind: 'unit', id: 'target', ownerId: 'player2' } })
const runtimes = Array.from({ length: 800 }, () => ({ ...createPolicyRuntime(p), currentStateId: 'act', wait: { stateId: 'act', status: 'pending', objective: objective() } }))
const production = Array.from({ length: 160 }, (_, index) => ({ ...createPolicyRuntime(p), currentStateId: 'act', wait: { stateId: 'act', status: 'pending', receiptId: createCompletionReceipt('player1', `stress-${index}`) } }))
const passes = []
for (let pass = 0; pass < 5; pass++) {
  resetUnitCompletionObjectives()
  const metrics = []
  let productionDueAt = 0
  let productionEvaluations = 0
  const startHeap = process.memoryUsage().heapUsed
  for (let batch = 0; batch < 200; batch++) {
    const now = batch * 150
    const view = { now }
    const start = performance.now()
    for (let i = 0; i < runtimes.length; i++) {
      unitCompletionStatus(units[i % units.length], runtimes[i].wait.objective, context, now)
      stepCompiledPolicy(program, runtimes[i], view)
    }
    if (now >= productionDueAt) {
      productionDueAt += 1000
      for (const runtime of production) {
        getCompletionReceipt(runtime.wait.receiptId)
        stepCompiledPolicy(productionProgram, runtime, view)
        productionEvaluations++
      }
    }
    metrics.push(performance.now() - start)
  }
  const sorted = metrics.slice().sort((a, b) => a - b)
  passes.push({ p95Ms: sorted[190], p99Ms: sorted[198], maxMs: sorted.at(-1), ...getUnitCompletionMetrics(), productionEvaluations, heapDeltaBytes: process.memoryUsage().heapUsed - startHeap })
}
console.log(JSON.stringify({ node: process.version, unitWaits: 800, productionWaits: 160, controlCadenceMs: 150, productionCadenceMs: 1000, passes,
  limits: 'Node CPU diagnostics only; heap delta is not a precise allocation or GC measure. Five passes use shared indexed exact-target lookup once per batch; no full-game GPU/FPS certification.' }, null, 2))
