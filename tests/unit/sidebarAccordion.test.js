import { describe, expect, it, vi } from 'vitest'
import {
  bindSidebarAccordions,
  isSidebarAccordionOpen,
  setSidebarAccordionOpen
} from '../../src/ui/sidebarAccordion.js'

function mountAccordion(idPrefix) {
  document.body.innerHTML = `
    <div id="sidebarScroll">
      <div class="sidebar-accordion">
        <button id="${idPrefix}Toggle" type="button" data-sidebar-accordion-toggle
          aria-expanded="false" aria-controls="${idPrefix}Content">
          <span>Section</span>
          <span id="${idPrefix}Icon" data-sidebar-accordion-icon>▼</span>
        </button>
        <div id="${idPrefix}Content" style="display: none;"></div>
      </div>
    </div>
  `
  return {
    toggle: document.getElementById(`${idPrefix}Toggle`),
    content: document.getElementById(`${idPrefix}Content`),
    icon: document.getElementById(`${idPrefix}Icon`)
  }
}

describe('sidebar accordion', () => {
  it('toggles open and closed like Map Settings', () => {
    const { toggle, content, icon } = mountAccordion('saveLoad')
    bindSidebarAccordions()

    expect(isSidebarAccordionOpen(content)).toBe(false)
    toggle.click()
    expect(content.classList.contains('is-open')).toBe(true)
    expect(content.style.display).toBe('')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(icon.textContent).toBe('▲')

    toggle.click()
    expect(content.classList.contains('is-open')).toBe(false)
    expect(content.style.display).toBe('')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(icon.textContent).toBe('▼')
  })

  it('does not bind the same toggle twice', () => {
    const { toggle, content } = mountAccordion('multiplayer')
    bindSidebarAccordions()
    bindSidebarAccordions()
    toggle.click()
    expect(isSidebarAccordionOpen(content)).toBe(true)
  })

  it('scrolls the opened section to the top of the sidebar when it is outside the viewport', () => {
    vi.useFakeTimers()
    const { toggle, content } = mountAccordion('mapSettings')
    const sidebarScroll = document.getElementById('sidebarScroll')
    sidebarScroll.scrollTop = 40
    sidebarScroll.scrollTo = vi.fn()
    content.getBoundingClientRect = () => ({ top: 400, bottom: 800 })
    sidebarScroll.getBoundingClientRect = () => ({ top: 100, bottom: 300 })

    bindSidebarAccordions()
    toggle.click()
    vi.runAllTimers()

    expect(sidebarScroll.scrollTo).toHaveBeenCalledWith({
      top: 332,
      behavior: 'smooth'
    })
    vi.useRealTimers()
  })

  it('sets the closed chevron without scrolling', () => {
    const { toggle, content, icon } = mountAccordion('statsSection')
    const sidebarScroll = document.getElementById('sidebarScroll')
    sidebarScroll.scrollTo = vi.fn()
    setSidebarAccordionOpen(toggle, content, icon, false)
    expect(icon.textContent).toBe('▼')
    expect(sidebarScroll.scrollTo).not.toHaveBeenCalled()
  })
})
