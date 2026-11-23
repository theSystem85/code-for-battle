import '../../../styles/perks.css'
import { gameState } from '../../gameState.js'
import { PERKS } from '../../perks/perkCatalog.js'
import { canPurchasePerk, getPerkLedger, hasLivingCommandCenter, hasLivingResearchCenter, subscribePerks } from '../../perks/perkState.js'
import { RESEARCH_PERKS } from '../../perks/researchCatalog.js'

let unsubscribe
let events

export function initPerkStarChip() {
  unsubscribe?.()
  events?.abort()
  const chip = document.getElementById('perkStarChip')
  const menu = document.getElementById('perkStarMenu')
  if (!chip || !menu) return
  document.body.appendChild(menu)
  events = new AbortController()
  const signal = events.signal
  const close = () => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false') }
  const positionMenu = () => {
    if (menu.hidden) return
    const anchor = chip.getBoundingClientRect()
    const gap = 5
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    menu.style.left = `${Math.max(0, Math.min(anchor.right + gap, window.innerWidth - width))}px`
    menu.style.top = `${Math.max(0, Math.min(anchor.top, window.innerHeight - height))}px`
  }
  chip.addEventListener('click', () => {
    if (!menu.hidden) return close()
    const owner = gameState.humanPlayer || 'player1'
    const command = hasLivingCommandCenter(owner)
    const research = hasLivingResearchCenter(owner)
    menu.querySelector('[data-perk-tree="command"]').hidden = !command
    menu.querySelector('[data-perk-tree="research"]').hidden = !research
    menu.querySelector('.perk-star-menu__empty').hidden = command || research
    menu.hidden = false
    positionMenu()
    chip.setAttribute('aria-expanded', 'true')
  }, { signal })
  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-perk-tree]')
    if (!button) return
    const owner = gameState.humanPlayer || 'player1'
    const available = button.dataset.perkTree === 'command' ? hasLivingCommandCenter(owner) : hasLivingResearchCenter(owner)
    close()
    if (available) import('./perkTree.js').then(({ openPerkTree }) => openPerkTree(button.dataset.perkTree))
  }, { signal })
  document.addEventListener('click', event => {
    if (!chip.contains(event.target) && !menu.contains(event.target)) close()
  }, { signal })
  window.addEventListener('resize', positionMenu, { signal })
  document.addEventListener('scroll', positionMenu, { signal, capture: true })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { close(); chip.focus() }
  }, { signal })

  const render = () => {
    const owner = gameState.humanPlayer || 'player1'
    chip.textContent = `★ ${getPerkLedger(owner).available}`
    const affordable = [PERKS, RESEARCH_PERKS].some(tree => tree.some(perk => canPurchasePerk(owner, perk.id).ok))
    chip.classList.toggle('is-affordable', affordable)
  }
  unsubscribe = subscribePerks(render)
  render()
}
