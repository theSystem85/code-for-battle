import '../styles/base.css'
import '../styles/sidebar.css'
import '../styles/spriteSheetEditor.css'
import '../styles/sseStandalone.css'
import { initializeGameStorage } from './storage/indexedDbStorage.js'
import { initSpriteSheetEditor } from './ui/spriteSheetEditor.js'

// Storage and editor only: no main.js, game orchestrator, renderer or asset boot.
window.logger ||= console

async function boot() {
  await initializeGameStorage()
  await initSpriteSheetEditor({ standalone: true })
}

boot()
