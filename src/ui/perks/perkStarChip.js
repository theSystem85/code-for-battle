import { gameState } from '../../gameState.js'
import { PERKS } from '../../perks/perkCatalog.js'
import { canPurchasePerk, getPerkLedger, subscribePerks } from '../../perks/perkState.js'
import { RESEARCH_PERKS } from '../../perks/researchCatalog.js'

let unsubscribe

export function initPerkStarChip() {
  unsubscribe?.()
  const chip = document.getElementById('perkStarChip')
  if (!chip) return

  const render = () => {
    const owner = gameState.humanPlayer || 'player1'
    chip.textContent = `★ ${getPerkLedger(owner).available}`
    const affordable = [PERKS, RESEARCH_PERKS].some(tree => tree.some(perk => canPurchasePerk(owner, perk.id).ok))
    chip.classList.toggle('is-affordable', affordable)
  }
  unsubscribe = subscribePerks(render)
  render()
}
