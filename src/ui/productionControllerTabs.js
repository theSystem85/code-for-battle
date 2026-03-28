import { gameState } from '../gameState.js'

export function ensureMobileToggle(controller) {
  if (!controller.mobileCategoryToggle || !controller.mobileCategoryToggle.isConnected) {
    controller.mobileCategoryToggle = document.getElementById('mobileCategoryToggle')
    controller.mobileCategoryToggleListenerAdded = false
  }

  if (controller.mobileCategoryToggle && !controller.mobileCategoryToggleListenerAdded) {
    controller.mobileCategoryToggle.addEventListener('click', () => controller.handleMobileCategoryToggle())
    controller.mobileCategoryToggleListenerAdded = true
  }
}

export function handleMobileCategoryToggle(controller) {
  const activeButton = document.querySelector('.tab-button.active[data-tab]')
  const currentTab = activeButton ? activeButton.getAttribute('data-tab') : null
  if (!currentTab) {
    return
  }

  const nextTab = currentTab === 'units' ? 'buildings' : 'units'
  controller.activateTab(nextTab, { scrollIntoView: true })
}

export function scrollTabIntoView(_controller, tabContent) {
  if (!tabContent) {
    return
  }

  const body = document.body
  if (body && body.classList.contains('mobile-landscape')) {
    const productionScroll = document.querySelector('#mobileBuildMenuContainer #production')
    if (productionScroll) {
      productionScroll.scrollTo({ top: 0, behavior: 'smooth' })
    }
    return
  }

  const sidebarScroll = document.getElementById('sidebarScroll')
  if (!sidebarScroll) {
    return
  }

  const productionTabs = document.getElementById('productionTabs')
  const firstProductionButton = tabContent.querySelector('.production-button')

  if (productionTabs && firstProductionButton) {
    const containerRect = sidebarScroll.getBoundingClientRect()
    const buttonRect = firstProductionButton.getBoundingClientRect()
    const tabsHeight = productionTabs.getBoundingClientRect().height
    const offset = buttonRect.top - containerRect.top + sidebarScroll.scrollTop - tabsHeight

    sidebarScroll.scrollTo({
      top: Math.max(offset, 0),
      behavior: 'smooth'
    })
  } else {
    sidebarScroll.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

export function forceLoadTabImages(_controller, tabContent) {
  if (!tabContent) {
    return
  }

  tabContent.querySelectorAll('img').forEach(img => {
    // Skip lazy-loaded images that haven't been activated yet
    // (their src is still the placeholder, data-src holds the real image)
    if (img.dataset.src && img.src !== img.dataset.src) {
      return
    }

    if (!img.complete || img.naturalHeight === 0) {
      const originalSrc = img.src
      img.src = ''
      setTimeout(() => { img.src = originalSrc }, 10)
    }
  })
}

export function activateTab(controller, tabName, options = {}) {
  const targetButton = document.querySelector(`#productionTabs .tab-button[data-tab="${tabName}"]`)
  if (!targetButton || targetButton.classList.contains('disabled')) {
    return false
  }

  const tabButtons = document.querySelectorAll('.tab-button[data-tab]')
  const tabContents = document.querySelectorAll('.tab-content')

  tabButtons.forEach(btn => btn.classList.remove('active'))
  tabContents.forEach(content => content.classList.remove('active'))

  targetButton.classList.add('active')
  const tabContent = document.getElementById(`${tabName}TabContent`)
  if (tabContent) {
    tabContent.classList.add('active')
    if (options.scrollIntoView) {
      controller.scrollTabIntoView(tabContent)
    }
    controller.forceLoadTabImages(tabContent)
  }

  controller.updateMobileCategoryToggle(tabName)
  return true
}

export function updateMobileCategoryToggle(controller, activeTabName) {
  controller.ensureMobileToggle()

  if (!controller.mobileCategoryToggle) {
    return
  }

  const activeTab = activeTabName
    || (document.querySelector('.tab-button.active[data-tab]')?.getAttribute('data-tab'))
    || 'buildings'

  const otherTab = activeTab === 'units' ? 'buildings' : 'units'
  const otherButton = document.querySelector(`#productionTabs .tab-button[data-tab="${otherTab}"]`)
  const otherDisabled = otherButton ? otherButton.classList.contains('disabled') : true

  const currentLabel = activeTab === 'units' ? 'UNITS' : 'BUILDINGS'
  const otherLabel = otherTab === 'units' ? 'UNITS' : 'BUILDINGS'

  controller.mobileCategoryToggle.disabled = otherDisabled
  controller.mobileCategoryToggle.tabIndex = otherDisabled ? -1 : 0
  controller.mobileCategoryToggle.textContent = currentLabel
  controller.mobileCategoryToggle.setAttribute('aria-pressed', activeTab === 'buildings' ? 'true' : 'false')
  controller.mobileCategoryToggle.setAttribute(
    'aria-label',
    otherDisabled ? `${currentLabel} build options` : `Switch to ${otherLabel} build options`
  )
}

export function initProductionTabs(controller) {
  const tabButtons = document.querySelectorAll('.tab-button[data-tab]')

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (button.classList.contains('disabled')) {
        return
      }

      const tabName = button.getAttribute('data-tab')
      controller.activateTab(tabName, { scrollIntoView: true })
    })
  })

  const activeButton = document.querySelector('.tab-button.active[data-tab]')
  if (activeButton) {
    controller.activateTab(activeButton.getAttribute('data-tab'), { scrollIntoView: false })
  } else if (tabButtons.length > 0) {
    const firstTab = tabButtons[0].getAttribute('data-tab')
    controller.activateTab(firstTab, { scrollIntoView: false })
  }

  controller.ensureMobileToggle()
  controller.updateTabStates()
}

export function updateTabStates(controller) {
  const unitsTab = document.querySelector('.tab-button[data-tab="units"]')
  const buildingsTab = document.querySelector('.tab-button[data-tab="buildings"]')

  if (!unitsTab || !buildingsTab) {
    return
  }

  const playerBuildings = (gameState.buildings || []).filter(
    b => b.owner === gameState.humanPlayer && b.health > 0
  )

  const hasConstructionYard = gameState.mapEditMode
    ? true
    : playerBuildings.some(b => b.type === 'constructionYard')
  const hasVehicleFactory = playerBuildings.some(b => b.type === 'vehicleFactory')

  // Check if units tab should be enabled (any unit types available)
  const hasAvailableUnits = gameState.availableUnitTypes.size > 0
  if (hasAvailableUnits) {
    unitsTab.classList.remove('disabled')
  } else {
    unitsTab.classList.add('disabled')
  }

  // Check if buildings tab should be enabled (any building types available)
  const hasAvailableBuildings =
    (gameState.mapEditMode || hasConstructionYard) &&
    gameState.availableBuildingTypes.size > 0
  if (hasAvailableBuildings) {
    buildingsTab.classList.remove('disabled')
  } else {
    buildingsTab.classList.add('disabled')
  }

  // If current active tab becomes disabled, switch to the other tab
  const activeTab = document.querySelector('.tab-button.active[data-tab]')
  const activeTabDisabled = activeTab && activeTab.classList.contains('disabled')
  const lostConstructionYard = !gameState.mapEditMode && !hasConstructionYard

  if (lostConstructionYard && buildingsTab?.classList.contains('active') && hasVehicleFactory && !unitsTab.classList.contains('disabled')) {
    controller.activateTab('units', { scrollIntoView: false })
  } else if (activeTabDisabled) {
    // Find the first non-disabled tab and activate it
    const enabledTab = document.querySelector('.tab-button[data-tab]:not(.disabled)')
    if (enabledTab) {
      controller.activateTab(enabledTab.getAttribute('data-tab'), { scrollIntoView: false })
    }
  }

  controller.updateMobileCategoryToggle()
}
