import { compareVersions, createReleaseDigest, releaseEntries, RELEASE_CATEGORIES } from './releaseDigest.js'

const CATEGORY_LABELS = {
  features: 'New features',
  improvements: 'Improvements',
  bugfixes: 'Bugfixes'
}

export function releaseAnchor(version) {
  return `release-${String(version).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export function releaseEntryAnchor(version, category, index) {
  return `${releaseAnchor(version)}-${category}-${index + 1}`
}

export function orderedReleaseEntries(entries = releaseEntries) {
  return [...entries].sort((a, b) => compareVersions(b.version, a.version))
}

export function createReleaseArchive(entries = releaseEntries) {
  const fragment = document.createDocumentFragment()
  for (const release of orderedReleaseEntries(entries)) {
    const article = document.createElement('article')
    article.id = releaseAnchor(release.version)
    article.className = 'release-notes__release'
    const component = createReleaseDigest({
      fromVersion: null,
      toVersion: release.version,
      ...Object.fromEntries(RELEASE_CATEGORIES.map(category => [category, release[category] || []]))
    }, { headingText: `Version v${release.version}` })
    for (const [categoryIndex, category] of RELEASE_CATEGORIES.entries()) {
      const list = component.root.querySelectorAll('ul')[categoryIndex]
      ;[...list.children].forEach((item, index) => {
        if (release[category]?.[index]) item.id = releaseEntryAnchor(release.version, category, index)
      })
    }
    article.appendChild(component.root)
    fragment.appendChild(article)
  }
  return fragment
}

export function createReleaseIndex(entries = releaseEntries) {
  const list = document.createElement('ol')
  list.className = 'release-notes__index-list'
  for (const release of orderedReleaseEntries(entries)) {
    const item = document.createElement('li')
    const releaseLink = document.createElement('a')
    releaseLink.href = `#${releaseAnchor(release.version)}`
    releaseLink.textContent = `Version v${release.version}`
    item.appendChild(releaseLink)
    const entryList = document.createElement('ul')
    for (const category of RELEASE_CATEGORIES) {
      for (const [index, description] of (release[category] || []).entries()) {
        const entryItem = document.createElement('li')
        const link = document.createElement('a')
        link.href = `#${releaseEntryAnchor(release.version, category, index)}`
        link.textContent = description
        link.dataset.category = CATEGORY_LABELS[category]
        entryItem.appendChild(link)
        entryList.appendChild(entryItem)
      }
    }
    item.appendChild(entryList)
    list.appendChild(item)
  }
  return list
}

export function initReleaseNotes() {
  const modal = document.getElementById('releaseNotesModal')
  const openButton = document.getElementById('releaseNotesBtn')
  if (!modal || !openButton || modal.dataset.bound === 'true') return
  modal.dataset.bound = 'true'
  const dialog = modal.querySelector('.release-notes__dialog')
  const tabs = [...modal.querySelectorAll('[role="tab"]')]
  const panels = [...modal.querySelectorAll('[role="tabpanel"]')]
  const indexPanel = document.getElementById('releaseNotesIndexPanel')
  const releasesPanel = document.getElementById('releaseNotesReleasesPanel')
  indexPanel.appendChild(createReleaseIndex())
  releasesPanel.appendChild(createReleaseArchive())
  let returnFocus = null

  const selectTab = (tabName, focus = false) => {
    tabs.forEach(tab => {
      const selected = tab.dataset.releaseTab === tabName
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      if (selected && focus) tab.focus()
    })
    panels.forEach(panel => { panel.hidden = panel.dataset.releasePanel !== tabName })
  }
  const close = () => {
    modal.classList.add('hidden')
    modal.setAttribute('aria-hidden', 'true')
    returnFocus?.focus()
  }
  const open = () => {
    returnFocus = document.activeElement
    modal.classList.remove('hidden')
    modal.setAttribute('aria-hidden', 'false')
    selectTab('index')
    tabs[0].focus()
  }

  openButton.addEventListener('click', open)
  modal.querySelector('[data-release-notes-close]').addEventListener('click', close)
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.releaseTab))
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault()
      selectTab(tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.releaseTab, true)
    })
  })
  indexPanel.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#release-"]')
    if (!link) return
    event.preventDefault()
    selectTab('releases')
    const target = document.getElementById(link.hash.slice(1))
    target?.scrollIntoView({ block: 'start' })
    window.history.replaceState(null, '', link.hash)
  })
  modal.addEventListener('click', event => { if (event.target === modal) close() })
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') close()
    if (event.key !== 'Tab') return
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')]
      .filter(element => !element.closest('[hidden]'))
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  })
}
