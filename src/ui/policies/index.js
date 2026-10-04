import { loadPolicyStore } from '../../policies/policyStore.js'
import { installPolicyConflictBanner } from './policyConflictBanner.js'
import { installActiveUnitsList } from './policyActiveUnitsList.js'
import { installPolicyPanel } from './policyPanel.js'
import { installUnitPolicyRadial } from './unitPolicyRadial.js'

let storeLoaded = false

/** Wire the policy UI: panel, conflict banner and the per-unit radial menu. */
export function installUnitPolicyUi(canvas, units) {
  if (!storeLoaded) {
    loadPolicyStore()
    storeLoaded = true
  }
  installPolicyPanel()
  installActiveUnitsList()
  installPolicyConflictBanner()
  return installUnitPolicyRadial(canvas, () => units)
}
