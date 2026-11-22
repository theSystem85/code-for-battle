import { gameState } from '../gameState.js'
import { RESEARCH_PERKS } from '../perks/researchCatalog.js'
import { ownsResearchPerk, subscribePerks } from '../perks/perkState.js'

const blueprints = RESEARCH_PERKS.flatMap(perk => perk.blueprints)
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
    card.innerHTML = `<img src="images/sidebar/${blueprint.image}.webp" alt="" loading="lazy"><span class="${blueprint.category}-name">${blueprint.name}</span><small class="research-build-card__status">Researched · coming later</small>`
    tab.appendChild(card)
    card.title = 'Researched · coming later'
    cards.push({ card, perkId: blueprint.perkId })
  }
  if (cards.length) subscribePerks(updateResearchBuildCards)
  updateResearchBuildCards()
}

export function updateResearchBuildCards() {
  if (!cards.length) return
  const owner = gameState.humanPlayer || 'player1'
  for (const { card, perkId } of cards) card.hidden = !ownsResearchPerk(owner, perkId)
}
