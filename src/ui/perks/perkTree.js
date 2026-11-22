import '../../../styles/perks.css'
import { isMultiplayerActive } from '../../pwa/liveUpdate.js'
import { gameState } from '../../gameState.js'
import { createPanSurface } from '../../input/panSurface.js'
import { RESEARCH_PERKS } from '../../perks/researchCatalog.js'
import { PERKS, getPerk } from '../../perks/perkCatalog.js'
import { canPurchasePerk, getPerkLedger, hasLivingCommandCenter, hasLivingResearchCenter, requestPerkPurchase, subscribePerks } from '../../perks/perkState.js'
import { attachAutomationViewport } from '../policies/automationViewport.js'

let overlay = null
let activeTree = 'command'
let cleanupViewport = null
let cleanupPan = null
let unsubscribe = null
let pauseWasRunning = false
let openTooltip = null
let confirmTimer = null

const owner = () => gameState.humanPlayer || 'player1'
const star = (gold = true) => `<svg class="perk-star${gold ? '' : ' is-dim'}" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.4 6.3-.9z"/></svg>`
const reasonText = { noResearchCenter: 'Build a Technology Research Center to purchase.', noCommandCenter: 'Rebuild the Command Center to purchase.', missingPrerequisite: 'Complete the previous perk in this lane.', insufficientStars: 'Earn more stars with unit veterancy.', owned: 'Owned' }

function unlockedItems(perk) {
  if (perk.blueprints?.length) return perk.blueprints.map(blueprint => blueprint.name).join(' · ')
  const items = [...perk.unlocks.conditions, ...perk.unlocks.effects]
  for (const option of perk.unlocks.options) items.push(`${option.param}: ${option.values.join(', ')}`)
  return items.length ? items.join(' · ') : perk.summary
}

function node(perk, ledger) {
  const status = canPurchasePerk(owner(), perk.id)
  const owned = ledger.owned.includes(perk.id)
  const state = owned ? 'owned' : status.ok ? 'available' : status.reason === 'insufficientStars' ? 'unaffordable' : ['noCommandCenter', 'noResearchCenter'].includes(status.reason) ? 'no-command-center' : 'locked'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `perk-node perk-node--${perk.lane} is-${state}`
  button.dataset.perkId = perk.id
  button.setAttribute('aria-label', `${perk.name}, ${owned ? 'owned' : `${perk.cost} stars, ${reasonText[status.reason] || 'available'}`}`)
  button.innerHTML = `<span class="perk-node__badge"><img src="/${perk.badge}" alt=""><span class="perk-node__lock" aria-hidden="true">⌾</span></span><strong>${perk.name}</strong><span class="perk-node__cost">${perk.auto ? 'included' : Array.from({ length: perk.cost }, () => star(owned)).join('')}</span>`
  const tooltip = document.createElement('aside')
  tooltip.className = 'perk-tooltip'
  tooltip.innerHTML = `<button class="perk-tooltip__close" type="button" aria-label="Close tooltip">×</button><h3>${perk.name}</h3><p>${perk.summary}</p><p><b>How to use:</b> ${perk.howTo}</p><p><b>Unlocks:</b> ${unlockedItems(perk)}</p><p class="perk-tooltip__state">${owned ? 'Owned' : status.ok ? `${perk.cost}★ · ready to unlock` : reasonText[status.reason] || 'Locked'}</p><a href="/docs/user-documentation.html#${perk.manualAnchor}">Manual →</a>${status.ok ? '<button type="button" class="perk-buy">Unlock perk</button>' : ''}`
  button.appendChild(tooltip)
  const closeTooltip = () => {
    button.classList.remove('show-tooltip')
    if (openTooltip === button) openTooltip = null
    clearTimeout(confirmTimer); confirmTimer = null
    const buy = tooltip.querySelector('.perk-buy')
    if (buy) { delete buy.dataset.confirm; buy.textContent = 'Unlock perk' }
  }
  tooltip.querySelector('.perk-tooltip__close').addEventListener('click', event => { event.stopPropagation(); closeTooltip() })
  button.addEventListener('click', event => {
    if (event.target.closest('a')) return
    if (event.target.closest('.perk-buy')) {
      event.stopPropagation()
      const available = getPerkLedger(owner()).available
      const buy = event.target.closest('.perk-buy')
      if (buy.dataset.confirm === 'true') {
        clearTimeout(confirmTimer); confirmTimer = null
        delete buy.dataset.confirm
        requestPerkPurchase(perk.id)
      }
      else {
        buy.dataset.confirm = 'true'
        buy.textContent = `Unlock ${perk.name} for ${perk.cost}★? ${available}★ → ${available - perk.cost}★`
        buy.focus()
        clearTimeout(confirmTimer)
        confirmTimer = setTimeout(closeTooltip, 5000)
      }
      return
    }
    if (openTooltip && openTooltip !== button) openTooltip.classList.remove('show-tooltip')
    const opening = !button.classList.contains('show-tooltip')
    if (opening) { button.classList.add('show-tooltip'); openTooltip = button } else closeTooltip()
  })
  return button
}

function connectors(perks, ledger) {
  return perks.slice(1).map(perk => {
    const requirement = perk.requires.all?.[0]
    const lit = requirement && ledger.owned.includes(requirement)
    return `<i class="perk-connector${lit ? ' is-lit' : ''}" aria-hidden="true"></i>`
  }).join('')
}

function render() {
  if (!overlay) return
  const ledger = getPerkLedger(owner())
  const canvas = overlay.querySelector('.perk-tree__canvas')
  canvas.replaceChildren()
  if (activeTree === 'research') {
    const section = document.createElement('section')
    section.className = 'perk-branch perk-branch--research'
    const [start, ...branches] = RESEARCH_PERKS
    const foundation = document.createElement('div')
    foundation.className = 'perk-branch__start'
    foundation.appendChild(node(start, ledger))
    const lanes = document.createElement('div')
    lanes.className = 'research-perk-lanes'
    for (const perk of branches) lanes.appendChild(node(perk, ledger))
    section.append(foundation, lanes)
    canvas.appendChild(section)
  } else renderCommandTree(canvas, ledger)
  overlay.querySelector('.perk-ledger').innerHTML = `${star()} <b>${ledger.available} available</b> · ${ledger.earned} earned · ${ledger.spent} used <small>Earn stars when units gain veterancy.</small>`
  const research = activeTree === 'research'
  const online = research ? hasLivingResearchCenter(owner()) : hasLivingCommandCenter(owner())
  const name = research ? 'Technology Research Center' : 'Command Center'
  overlay.querySelector('.perk-tree__cc-state').textContent = online ? `${name} online` : `View only · rebuild the ${name} to purchase perks`
}

function renderCommandTree(canvas, ledger) {
  for (const tree of ['base', 'prod', 'unit', 'def']) {
    const perks = PERKS.filter(perk => perk.tree === tree && perk.lane !== 'capstone')
    const column = document.createElement('section')
    column.className = `perk-branch perk-branch--${tree}`
    const start = perks.find(perk => perk.lane === 'start')
    const ifPerks = perks.filter(perk => perk.lane === 'if')
    const doPerks = perks.filter(perk => perk.lane === 'do')
    column.innerHTML = `<h2>${{ base: 'Base build', prod: 'Unit build', unit: 'Unit control', def: 'Base defence' }[tree]}</h2><div class="perk-branch__start"></div><div class="perk-lanes"><div class="perk-lane perk-lane--if"><span>IF</span>${connectors(ifPerks, ledger)}</div><div class="perk-lane perk-lane--do"><span>DO</span>${connectors(doPerks, ledger)}</div></div>`
    column.querySelector('.perk-branch__start').appendChild(node(start, ledger))
    const lanes = column.querySelectorAll('.perk-lane')
    ifPerks.forEach(perk => lanes[0].appendChild(node(perk, ledger)))
    doPerks.forEach(perk => lanes[1].appendChild(node(perk, ledger)))
    canvas.appendChild(column)
  }
  const capstone = getPerk('cc.def.capstone')
  const cap = document.createElement('section')
  cap.className = 'perk-capstone'
  const ends = ['cc.unit.if.sensing', 'cc.unit.do.air', 'cc.def.if.world', 'cc.def.do.manual', 'cc.base.if.enemies', 'cc.base.do.defence', 'cc.prod.if.enemies', 'cc.prod.do.naval']
  cap.innerHTML = `<svg class="perk-capstone__merge" viewBox="0 0 800 100" preserveAspectRatio="none" aria-hidden="true">${ends.map((id, index) => `<path class="${ledger.owned.includes(id) ? 'is-lit' : ''}" d="M${50 + index * 100} 0 L${50 + index * 100} 45 L400 95"/>`).join('')}</svg>`
  cap.appendChild(node(capstone, ledger))
  canvas.appendChild(cap)
}

export function openPerkTree(tree = 'command') {
  if (overlay && activeTree === tree) return overlay
  if (overlay) closePerkTree()
  activeTree = tree
  const research = tree === 'research'
  overlay = document.createElement('div')
  overlay.className = 'perk-tree-overlay'
  overlay.innerHTML = '<main class="perk-tree" role="dialog" aria-modal="true" aria-labelledby="perkTreeTitle"><header><div><p>COMMAND CENTER</p><h1 id="perkTreeTitle">Automation Perks</h1><span class="perk-tree__cc-state"></span></div><button class="perk-tree__close" type="button" aria-label="Close perk tree">×</button></header><div class="perk-tree__viewport" tabindex="0"><div class="perk-tree__canvas"></div></div><footer class="perk-ledger"></footer></main>'
  if (research) {
    overlay.classList.add('research-perk-overlay')
    overlay.querySelector('header p').textContent = 'TECHNOLOGY RESEARCH CENTER'
    overlay.querySelector('#perkTreeTitle').textContent = 'Research Perks'
  }
  document.body.appendChild(overlay)
  cleanupViewport = attachAutomationViewport(overlay, overlay.querySelector('.perk-tree'))
  const viewport = overlay.querySelector('.perk-tree__viewport')
  cleanupPan = createPanSurface(viewport, { content: overlay.querySelector('.perk-tree__canvas'), initialX: research ? 0 : 450, speed: 1.2, inertia: true })
  overlay.querySelector('.perk-tree__close').addEventListener('click', closePerkTree)
  overlay.addEventListener('keydown', event => { if (event.key === 'Escape') closePerkTree() })
  overlay.addEventListener('pointerup', event => {
    if (event.target === overlay) closePerkTree()
    else if (openTooltip && !event.target.closest('.perk-node')) {
      openTooltip.classList.remove('show-tooltip'); openTooltip = null
      clearTimeout(confirmTimer); confirmTimer = null
    }
  })
  overlay.addEventListener('selectstart', event => event.preventDefault())
  overlay.addEventListener('dragstart', event => event.preventDefault())
  unsubscribe = subscribePerks(render)
  pauseWasRunning = (research ? !isMultiplayerActive(gameState) : !gameState.multiplayerSession?.isRemote) && gameState.gamePaused === false
  if (pauseWasRunning) gameState.gamePaused = true
  render()
  viewport.focus()
  return overlay
}

export function closePerkTree() {
  if (!overlay) return
  unsubscribe?.(); unsubscribe = null
  cleanupPan?.destroy(); cleanupPan = null
  cleanupViewport?.(); cleanupViewport = null
  clearTimeout(confirmTimer); confirmTimer = null; openTooltip = null
  overlay.remove(); overlay = null
  if (pauseWasRunning) gameState.gamePaused = false
  pauseWasRunning = false
}

export function isPerkTreeOpen() { return Boolean(overlay) }
