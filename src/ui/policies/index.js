import { loadPolicyStore } from '../../policies/policyStore.js'
import { installPolicyConflictBanner } from './policyConflictBanner.js'
import { installPolicyPanel } from './policyPanel.js'
import { installUnitPolicyRadial } from './unitPolicyRadial.js'
import { installAutomationSidebar } from './automationSidebar.js'

let storeLoaded = false

/** Wire the policy UI: panel, conflict banner and the per-unit radial menu. */
export function installUnitPolicyUi(canvas, units) {
  if (!storeLoaded) {
    loadPolicyStore()
    storeLoaded = true
  }
  installPolicyPanel()
  installAutomationSidebar()
  installPolicyConflictBanner()
  return installUnitPolicyRadial(canvas, () => units)
}
