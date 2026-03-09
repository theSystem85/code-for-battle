// runtimeConfigDialog.js
// UI dialog for runtime configuration without eval()

import {
  configRegistry,
  getConfigCategories,
  getConfigsByCategory,
  getConfigValue,
  setConfigValue,
  isConfigMutable
} from '../configRegistry.js'
import { showNotification } from './notifications.js'
import { playSound } from '../sound.js'

export class RuntimeConfigDialog {
  constructor() {
    this.isDialogOpen = false
    this.selectedCategory = null
    this.searchQuery = ''
    this.setupStyles()
  }

  setupStyles() {
    // Inject CSS styles for the runtime config dialog
    if (!document.getElementById('runtime-config-dialog-styles')) {
      const style = document.createElement('style')
      style.id = 'runtime-config-dialog-styles'
      style.textContent = `
        .runtime-config-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          backdrop-filter: blur(2px);
          padding: 16px;
          box-sizing: border-box;
        }

        .runtime-config-dialog {
          background: #1b1f24;
          border: 1px solid #2d3640;
          border-radius: 12px;
          padding: 0;
          width: min(680px, calc(100% - 24px));
          max-height: min(85vh, 700px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
          font-family: 'Rajdhani', 'Arial Narrow', 'Segoe UI', Tahoma, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .runtime-config-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #2d3640;
          background: linear-gradient(90deg, rgba(45, 65, 90, 0.6), rgba(25, 33, 46, 0.6));
        }

        .runtime-config-dialog h2 {
          color: #e5e5e5;
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .runtime-config-close {
          background: transparent;
          border: none;
          color: #e5e5e5;
          font-size: 22px;
          cursor: pointer;
          padding: 4px 8px;
          line-height: 1;
          transition: color 0.2s ease;
          border-radius: 4px;
        }

        .runtime-config-close:hover {
          color: #ffcc66;
        }

        .runtime-config-categories {
          display: flex;
          gap: 8px;
          padding: 12px 20px;
          flex-wrap: wrap;
          border-bottom: 1px solid #2d3640;
          background: rgba(0, 0, 0, 0.15);
        }

        .runtime-config-search {
          padding: 12px 20px;
          border-bottom: 1px solid #2d3640;
          background: rgba(0, 0, 0, 0.12);
        }

        .runtime-config-search-input {
          width: 100%;
          padding: 10px 12px;
          font-size: 14px;
          border: 1px solid #3c4a58;
          border-radius: 6px;
          background: #1a1f27;
          color: #e5e5e5;
          font-family: inherit;
          box-sizing: border-box;
        }

        .runtime-config-search-input:focus {
          border-color: #4da3ff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(77, 163, 255, 0.2);
        }

        .runtime-config-result-meta {
          color: #9fb3c8;
          font-size: 11px;
          margin-top: 6px;
        }

        .runtime-config-no-results {
          padding: 12px;
          color: #9fb3c8;
          font-size: 13px;
          text-align: center;
          border: 1px dashed #3c4a58;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.01);
        }

        .runtime-config-category-btn {
          background: #232b33;
          color: #9fb3c8;
          border: 1px solid #2d3640;
          border-radius: 6px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 13px;
          font-family: inherit;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .runtime-config-category-btn:hover {
          background: #2a343e;
          color: #cfd8e3;
        }

        .runtime-config-category-btn.active {
          background: linear-gradient(135deg, rgba(77, 163, 255, 0.2), rgba(76, 110, 255, 0.25));
          border-color: #4da3ff;
          color: #ffffff;
        }

        .runtime-config-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .runtime-config-item {
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border-left: 3px solid #3c4a58;
          transition: background-color 0.15s ease;
        }

        .runtime-config-item:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .runtime-config-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          gap: 12px;
        }

        .runtime-config-item-name {
          color: #e5e5e5;
          font-weight: 600;
          font-size: 14px;
        }

        .runtime-config-item-value {
          color: #4da3ff;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', monospace;
          font-size: 13px;
          background: rgba(77, 163, 255, 0.1);
          padding: 3px 8px;
          border-radius: 4px;
        }

        .runtime-config-item-description {
          color: #9fb3c8;
          font-size: 12px;
          margin-bottom: 10px;
          line-height: 1.5;
        }

        .runtime-config-item-control {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .runtime-config-input {
          flex: 1;
          padding: 10px 14px;
          font-size: 14px;
          border: 1px solid #3c4a58;
          border-radius: 6px;
          background: #1a1f27;
          color: #e5e5e5;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', monospace;
          transition: all 0.15s ease;
        }

        .runtime-config-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .runtime-config-input:focus {
          border-color: #4da3ff;
          outline: none;
          box-shadow: 0 0 0 3px rgba(77, 163, 255, 0.2);
        }

        .runtime-config-checkbox {
          width: 20px;
          height: 20px;
          cursor: pointer;
          accent-color: #4da3ff;
        }

        .runtime-config-checkbox:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .runtime-config-readonly {
          color: #ffcc66;
          font-size: 11px;
          font-style: italic;
        }

        .runtime-config-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid #2d3640;
          background: rgba(0, 0, 0, 0.1);
        }

        .runtime-config-button {
          padding: 10px 20px;
          font-size: 14px;
          border: 1px solid #3c4a58;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 500;
          font-family: inherit;
        }

        .runtime-config-button.primary {
          background: linear-gradient(135deg, #4da3ff, #3a7bd5);
          border-color: #4da3ff;
          color: #ffffff;
        }

        .runtime-config-button.primary:hover {
          background: linear-gradient(135deg, #5eb3ff, #4a8be5);
          border-color: #5eb3ff;
        }

        .runtime-config-button.secondary {
          background: #2d3640;
          border-color: #3c4a58;
          color: #e5e5e5;
        }

        .runtime-config-button.secondary:hover {
          background: #3a4a5c;
          border-color: #4da3ff;
          color: #ffffff;
        }

        /* Mobile responsive styles */
        @media screen and (max-width: 600px) {
          .runtime-config-overlay {
            padding: 10px;
          }

          .runtime-config-dialog {
            width: 100%;
            max-height: calc(100vh - 20px);
            border-radius: 10px;
          }

          .runtime-config-header {
            padding: 12px 14px;
          }

          .runtime-config-header h2 {
            font-size: 16px;
          }

          .runtime-config-categories {
            padding: 10px 14px;
          }

          .runtime-config-search {
            padding: 10px 14px;
          }

          .runtime-config-category-btn {
            padding: 8px 12px;
            font-size: 12px;
            flex: 1;
            text-align: center;
          }

          .runtime-config-content {
            padding: 12px 14px;
          }

          .runtime-config-item {
            padding: 10px 12px;
          }

          .runtime-config-item-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
          }

          .runtime-config-item-name {
            font-size: 13px;
          }

          .runtime-config-item-description {
            font-size: 11px;
          }

          .runtime-config-input {
            padding: 12px 14px;
            font-size: 16px; /* Prevent iOS zoom */
          }

          .runtime-config-buttons {
            padding: 12px 14px;
            flex-direction: column;
          }

          .runtime-config-button {
            width: 100%;
            padding: 12px;
            justify-content: center;
          }
        }
      `
      document.head.appendChild(style)
    }
  }

  openDialog() {
    if (this.isDialogOpen) return

    this.isDialogOpen = true

    // Create dialog overlay
    const overlay = document.createElement('div')
    overlay.className = 'runtime-config-overlay'
    overlay.id = 'runtime-config-overlay'

    // Create dialog
    const dialog = document.createElement('div')
    dialog.className = 'runtime-config-dialog'

    // Get categories
    const categories = getConfigCategories()
    this.selectedCategory = categories[0] || null
    this.searchQuery = ''

    dialog.innerHTML = `
      <div class="runtime-config-header">
        <h2>⚙️ Runtime Configuration</h2>
        <button class="runtime-config-close" id="runtime-config-close">✕</button>
      </div>
      <div class="runtime-config-search">
        <input
          id="runtime-config-search-input"
          class="runtime-config-search-input"
          type="search"
          placeholder="Search variables by name or value"
          aria-label="Search runtime configuration"
        >
      </div>
      <div class="runtime-config-categories" id="runtime-config-categories"></div>
      <div class="runtime-config-content" id="runtime-config-content"></div>
      <div class="runtime-config-buttons">
        <button class="runtime-config-button secondary" id="runtime-config-refresh">Refresh</button>
        <button class="runtime-config-button primary" id="runtime-config-done">Done</button>
      </div>
    `

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    // Render categories
    this.renderCategories(categories)

    // Render content for selected category
    this.renderContent()

    // Add event listeners
    this.setupDialogEventListeners(overlay)

    // Prevent game inputs while dialog is open
    this.pauseGameInput(true)
  }

  renderCategories(categories) {
    const container = document.getElementById('runtime-config-categories')
    if (!container) return

    container.innerHTML = ''
    categories.forEach(category => {
      const btn = document.createElement('button')
      btn.className = 'runtime-config-category-btn'
      btn.textContent = category
      if (category === this.selectedCategory) {
        btn.classList.add('active')
      }
      btn.addEventListener('click', () => {
        this.selectedCategory = category
        this.renderCategories(categories)
        this.renderContent()
      })
      container.appendChild(btn)
    })
  }

  renderContent() {
    const container = document.getElementById('runtime-config-content')
    if (!container || !this.selectedCategory) return
    container.innerHTML = ''

    const hasSearchQuery = this.searchQuery.trim().length > 0
    const configs = hasSearchQuery ? this.getSearchMatches() : Object.entries(getConfigsByCategory(this.selectedCategory))

    if (configs.length === 0) {
      container.innerHTML = '<div class="runtime-config-no-results">No configuration variables match your search.</div>'
      return
    }

    configs.forEach(([id, entry]) => {
      const isSearchResult = hasSearchQuery
      const item = document.createElement('div')
      item.className = 'runtime-config-item'

      const currentValue = getConfigValue(id)
      const isMutable = isConfigMutable(id)

      let controlHtml = ''
      if (entry.type === 'boolean') {
        controlHtml = `
          <input
            type="checkbox"
            class="runtime-config-checkbox"
            id="config-${id}"
            ${currentValue ? 'checked' : ''}
            ${!isMutable ? 'disabled' : ''}
          >
        `
      } else if (entry.type === 'number') {
        const attrs = []
        if (entry.min !== undefined) attrs.push(`min="${entry.min}"`)
        if (entry.max !== undefined) attrs.push(`max="${entry.max}"`)
        if (entry.step !== undefined) attrs.push(`step="${entry.step}"`)
        if (!isMutable) attrs.push('disabled')

        controlHtml = `
          <input
            type="number"
            class="runtime-config-input"
            id="config-${id}"
            value="${currentValue}"
            ${attrs.join(' ')}
          >
        `
      } else if (entry.type === 'string') {
        controlHtml = `
          <input
            type="text"
            class="runtime-config-input"
            id="config-${id}"
            value="${currentValue}"
            ${!isMutable ? 'disabled' : ''}
          >
        `
      }

      item.innerHTML = `
        <div class="runtime-config-item-header">
          <span class="runtime-config-item-name">${entry.name}</span>
          <span class="runtime-config-item-value">${this.formatValue(currentValue, entry.type)}</span>
        </div>
        <div class="runtime-config-item-description">
          ${entry.description}
          ${!isMutable ? '<span class="runtime-config-readonly"> (read-only)</span>' : ''}
          ${isSearchResult ? `<div class="runtime-config-result-meta">Category: ${entry.category} · Variable: ${id}</div>` : ''}
        </div>
        <div class="runtime-config-item-control">
          ${controlHtml}
        </div>
      `

      container.appendChild(item)

      // Add change listener for mutable configs
      if (isMutable) {
        const input = document.getElementById(`config-${id}`)
        if (input) {
          input.addEventListener('change', (e) => {
            let newValue
            if (entry.type === 'boolean') {
              newValue = e.target.checked
            } else if (entry.type === 'number') {
              newValue = parseFloat(e.target.value)
            } else {
              newValue = e.target.value
            }

            const success = setConfigValue(id, newValue)
            if (success) {
              showNotification(`Updated ${entry.name}`, 2000)
              playSound('confirmed', 0.5)
              this.updateValueDisplay(id, newValue, entry.type)
            } else {
              showNotification(`Failed to update ${entry.name}`, 2000)
              playSound('error', 0.5)
            }
          })
        }
      }
    })
  }


  matchesSearchTerm(text, query) {
    const normalizedText = String(text || '').toLowerCase()
    const normalizedQuery = String(query || '').toLowerCase()

    if (!normalizedQuery) return true
    if (normalizedText.includes(normalizedQuery)) return true

    let queryIndex = 0
    for (const char of normalizedText) {
      if (char === normalizedQuery[queryIndex]) {
        queryIndex += 1
        if (queryIndex === normalizedQuery.length) {
          return true
        }
      }
    }

    return false
  }

  getSearchMatches() {
    const query = this.searchQuery.trim().toLowerCase()
    if (!query) return []

    return Object.entries(configRegistry).filter(([id, entry]) => {
      const value = this.formatValue(getConfigValue(id), entry.type).toLowerCase()
      return this.matchesSearchTerm(entry.name, query) || this.matchesSearchTerm(id, query) || this.matchesSearchTerm(value, query)
    })
  }

  formatValue(value, type) {
    if (type === 'boolean') {
      return value ? 'true' : 'false'
    } else if (type === 'number') {
      return typeof value === 'number' ? value.toFixed(3).replace(/\.?0+$/, '') : value
    }
    return String(value)
  }

  updateValueDisplay(configId, newValue, type) {
    const item = document.getElementById(`config-${configId}`)
    if (!item) return

    const parent = item.closest('.runtime-config-item')
    if (!parent) return

    const valueSpan = parent.querySelector('.runtime-config-item-value')
    if (valueSpan) {
      valueSpan.textContent = this.formatValue(newValue, type)
    }
  }

  setupDialogEventListeners(overlay) {
    const closeBtn = document.getElementById('runtime-config-close')
    const doneBtn = document.getElementById('runtime-config-done')
    const refreshBtn = document.getElementById('runtime-config-refresh')

    const closeDialog = () => {
      this.closeDialog()
    }

    const refreshDialog = () => {
      this.renderContent()
      showNotification('Configuration refreshed', 1500)
    }

    const searchInput = document.getElementById('runtime-config-search-input')

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value || ''
        this.renderContent()
      })
    }

    if (closeBtn) closeBtn.addEventListener('click', closeDialog)
    if (doneBtn) doneBtn.addEventListener('click', closeDialog)
    if (refreshBtn) refreshBtn.addEventListener('click', refreshDialog)

    // ESC key to close
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDialog()
      }
    }
    document.addEventListener('keydown', keyHandler)

    // Store handler for cleanup
    overlay.dataset.keyHandler = 'attached'
    overlay._keyHandler = keyHandler

    // Click overlay to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog()
      }
    })
  }

  closeDialog() {
    if (!this.isDialogOpen) return

    const overlay = document.getElementById('runtime-config-overlay')
    if (overlay) {
      // Remove key handler
      if (overlay._keyHandler) {
        document.removeEventListener('keydown', overlay._keyHandler)
      }
      overlay.remove()
    }

    this.isDialogOpen = false
    this.pauseGameInput(false)
  }

  pauseGameInput(paused) {
    // Import gameState dynamically to avoid circular dependencies
    import('../gameState.js').then(({ gameState }) => {
      if (paused) {
        gameState.runtimeConfigDialogOpen = true
      } else {
        gameState.runtimeConfigDialogOpen = false
      }
    })
  }

  toggle() {
    if (this.isDialogOpen) {
      this.closeDialog()
    } else {
      this.openDialog()
    }
  }

  isOpen() {
    return this.isDialogOpen
  }
}

// Create singleton instance
export const runtimeConfigDialog = new RuntimeConfigDialog()
