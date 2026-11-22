import { gameState } from '../gameState.js'
import { RESEARCH_PERKS } from '../perks/researchCatalog.js'
import { hasLivingResearchCenter, ownsResearchPerk, subscribePerks } from '../perks/perkState.js'

const blueprints = RESEARCH_PERKS.flatMap(perk => perk.blueprints.map(blueprint => ({ ...blueprint, perkName: perk.name })))
const cards = []

export function setupResearchBuildCards() {
  if (cards.length) return
  for (const blueprint of blueprints) {
    const tab = document.getElementById(blueprint.category === 'unit' ? 'unitsTabContent' : 'buildingsTabContent')
    if (!tab) continue
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'production-button unlocked research-build-card'
    card.dataset.researchBlueprint = blueprint.type
    card.hidden = true
    card.setAttribute('aria-disabled', 'true')
    card.innerHTML = `<img src="images/sidebar/${blueprint.image}.webp" alt="" loading="lazy"><span class="${blueprint.category}-name">${blueprint.name}</span><small class="research-build-card__status"></small>`
    tab.appendChild(card)
    cards.push({ card, blueprint, status: card.querySelector('small') })
  }
  if (cards.length) subscribePerks(updateResearchBuildCards)
  updateResearchBuildCards()
}

export function updateResearchBuildCards() {
  if (!cards.length) return
  const owner = gameState.humanPlayer || 'player1'
  const online = hasLivingResearchCenter(owner)
  for (const { card, blueprint, status } of cards) {
    const owned = ownsResearchPerk(owner, blueprint.perkId)
    card.hidden = !online && !owned
    const label = !online ? 'Requires Research Center' : owned ? 'Researched · coming later' : `Research ${blueprint.perkName}`
    status.textContent = label
    card.title = label
  }
}
