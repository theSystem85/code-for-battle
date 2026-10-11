// Size-bound compile diagnostics; no gameplay rendering certification.
import { performance } from 'node:perf_hooks'
import { compilePolicyProgram } from '../src/policies/policyCompiler.js'
import { POLICY_SCHEMA_VERSION } from '../src/policies/policySchema.js'
const policy = { schemaVersion: POLICY_SCHEMA_VERSION, id: 'compile-stress', name: 'Compile stress',
  variant: 'unit', scope: 'global', execution: 'continuous', initialStateId: 's0',
  states: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, transitions: [] })) }
let rules = 0
while (Buffer.byteLength(JSON.stringify(policy)) < 64 * 1024) {
  const state = rules % 7
  policy.states[state].transitions.push({ id: `r${rules++}`, kind: 'if',
    when: { type: 'and', of: [{ type: 'compare', field: 'hp', op: '<', value: .5 }, { type: 'underFire' }] }, to: `s${(state + 1) % 7}` })
}
const samplesMs = []
let instructions = 0
for (let pass = 0; pass < 50; pass++) {
  const start = performance.now()
  const artifact = compilePolicyProgram(policy)
  samplesMs.push(performance.now() - start)
  instructions = artifact.conditionInstructions.length
}
const sorted = samplesMs.slice().sort((a, b) => a - b)
console.log(JSON.stringify({ node: process.version, documentBytes: Buffer.byteLength(JSON.stringify(policy)),
  states: 7, rules, instructions, samplesMs, p95Ms: sorted[47], maxMs: sorted.at(-1),
  limitation: '64 KiB JSON machine diagnostic, not the CFBL source-size fixture or a full-game hardware certificate.' }, null, 2))
