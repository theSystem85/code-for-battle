const SIDEBAR_ACCORDION_SCROLL_DELAY_MS = 50

export function isSidebarAccordionOpen(content) {
  if (!content) return false
  return content.style.display !== 'none'
}

export function setSidebarAccordionOpen(toggle, content, icon, open) {
  if (!toggle || !content) return
  content.style.display = open ? 'block' : 'none'
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (icon) icon.textContent = open ? '▲' : '▼'
}

function scrollAccordionContentIntoView(content) {
  const sidebarScroll = document.getElementById('sidebarScroll')
  if (!sidebarScroll || !content) return

  const contentRect = content.getBoundingClientRect()
  const sidebarRect = sidebarScroll.getBoundingClientRect()
  const contentTopOffset = contentRect.top - sidebarRect.top
  const contentBottomOffset = contentRect.bottom - sidebarRect.bottom
  const isContentOutsideViewport = contentTopOffset < 0 || contentBottomOffset > 0

  if (!isContentOutsideViewport) return

  const scrollTop = Math.max(0, sidebarScroll.scrollTop + contentTopOffset - 8)
  sidebarScroll.scrollTo({
    top: scrollTop,
    behavior: 'smooth'
  })
}

export function bindSidebarAccordionToggle(toggle) {
  if (!toggle || toggle.dataset.sidebarAccordionBound === 'true') return
  const contentId = toggle.getAttribute('aria-controls')
  const content = contentId ? document.getElementById(contentId) : null
  const icon = toggle.querySelector('[data-sidebar-accordion-icon]')
  if (!content) return

  toggle.dataset.sidebarAccordionBound = 'true'
  toggle.addEventListener('click', () => {
    const nextOpen = !isSidebarAccordionOpen(content)
    setSidebarAccordionOpen(toggle, content, icon, nextOpen)
    if (nextOpen) {
      setTimeout(() => scrollAccordionContentIntoView(content), SIDEBAR_ACCORDION_SCROLL_DELAY_MS)
    }
  })
}

export function bindSidebarAccordions(root = document) {
  root.querySelectorAll('[data-sidebar-accordion-toggle]').forEach(bindSidebarAccordionToggle)
}
