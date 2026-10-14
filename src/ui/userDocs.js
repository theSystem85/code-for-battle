import { createReleaseDigest, getManualReleaseDigest } from './releaseDigest.js'

const DOCS_URL = '/docs/user-documentation.html'

function closeDocsModal(modal) {
  if (!modal) return
  modal.classList.add('hidden')
  modal.setAttribute('aria-hidden', 'true')
}

function openDocsModal(modal, iframe) {
  if (!modal) return
  if (iframe && iframe.dataset.loaded !== 'true') {
    iframe.addEventListener('load', () => {
      const doc = iframe.contentDocument
      if (!doc?.body || doc.getElementById('userManualReleaseDigest')) return
      const component = createReleaseDigest(getManualReleaseDigest())
      component.root.id = 'userManualReleaseDigest'
      component.root.classList.add('wrap')
      const target = doc.querySelector('.wrap') || doc.body
      target.appendChild(doc.adoptNode(component.root))
    })
    iframe.src = DOCS_URL
    iframe.dataset.loaded = 'true'
  }
  modal.classList.remove('hidden')
  modal.setAttribute('aria-hidden', 'false')
}

export function initUserDocs() {
  const modal = document.getElementById('userDocsModal')
  if (!modal) return

  const iframe = document.getElementById('userDocsFrame')
  const closeBtn = document.getElementById('userDocsCloseBtn')
  const sidebarBtn = document.getElementById('userDocsBtn')

  const bindOpen = (button) => {
    if (!button || button.dataset.docsBound === 'true') return
    button.dataset.docsBound = 'true'
    button.addEventListener('click', () => openDocsModal(modal, iframe))
  }

  bindOpen(sidebarBtn)

  closeBtn?.addEventListener('click', () => closeDocsModal(modal))

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeDocsModal(modal)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeDocsModal(modal)
    }
  })

  window.openUserDocs = () => openDocsModal(modal, iframe)
}
