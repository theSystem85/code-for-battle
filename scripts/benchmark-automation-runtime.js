// Diagnostic CPU benchmark; this does not certify presented FPS.
import { performance } from 'node:perf_hooks'
import { compilePolicyProgram, stepCompiledPolicy } from '../src/policies/policyCompiler.js'
import { createPolicyRuntime, stepPolicy } from '../src/policies/policyStep.js'
import { POLICY_SCHEMA_VERSION } from '../src/policies/policySchema.js'

const policy = {
  schemaVersion: POLICY_SCHEMA_VERSION, id: 'benchmark', name: 'Runtime benchmark',
  variant: 'unit', scope: 'global', execution: 'continuous', initialStateId: 's0',
  states: Array.from({ length: 7 }, (_, index) => ({
    id: `s${index}`, transitions: [{ id: `r${index}`, kind: 'if', when: { type: 'always' }, to: `s${(index + 1) % 7}` }]
  }))
}
const program = compilePolicyProgram(policy)
const view = { now: 0 }
function run(step) {
  let runtime = createPolicyRuntime(policy)
  const start = performance.now()
  for (let i = 0; i < 100000; i++) runtime = step(runtime).runtime
  return performance.now() - start
}
const referenceMs = []
const compiledMs = []
for (let pass = 0; pass < 5; pass++) {
  referenceMs.push(run(runtime => stepPolicy(policy, runtime, view)))
  compiledMs.push(run(runtime => stepCompiledPolicy(program, runtime, view)))
}
const bindings = Array.from({ length: (200 + 40) * 4 }, () => createPolicyRuntime(policy))
const batchMs = []
for (let tick = 0; tick < 200; tick++) {
  const start = performance.now()
  for (let index = 0; index < bindings.length; index++) bindings[index] = stepCompiledPolicy(program, bindings[index], view).runtime
  batchMs.push(performance.now() - start)
}
const sorted = batchMs.slice().sort((a, b) => a - b)
const compileMs = []
for (let i = 0; i < 100; i++) {
  const start = performance.now()
  compilePolicyProgram(policy)
  compileMs.push(performance.now() - start)
}
console.log(JSON.stringify({
  node: process.version, scenario: 'seven-state constant IF cycle; 100000 evaluations/pass; 960 bindings per active cadence batch',
  referenceMs, compiledMs,
  activeBatchMs: { p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)], max: sorted.at(-1) },
  compileMs, bindings: bindings.length, sensorQueries: 0,
  limits: 'Node CPU diagnostics only; no rendering, realistic sensing, GPU timing, or 75 FPS certification. Active-batch budget may be missed on this shared host.'
}, null, 2))
