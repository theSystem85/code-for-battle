/** Capture genuine Automation editor UI from the integrated demo game. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.AUTOMATION_SCREENSHOT_DIR || 'public/images/landing/automation'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--mute-audio']
})
await fs.mkdir(output, { recursive: true })

async function openScene(viewport, phone = false) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone,
    userAgent: phone ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' : undefined
  })
  await context.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts-game-master-volume', '0')
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.gameState && window.gameInstance && document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), { timeout: 120000 })
  await page.evaluate(async () => {
    const save = await import('/src/saveGame.js')
    save.loadGame('builtin:demo')
  })
  await page.waitForFunction(() => window.gameState.currentSessionId === 'demo' && document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), { timeout: 120000 })
  await page.evaluate(async () => {
    window.gameState.gamePaused = true
    window.gameState.gameStarted = true
    document.querySelectorAll('.notification').forEach(node => node.remove())
    const templates = await import('/src/policies/policyTemplates.js')
    const store = await import('/src/policies/policyStore.js')
    const policy = templates.createBlankPolicy('landing-automation-example')
    policy.name = 'Engage or advance'
    policy.execution = 'oneTime'
    policy.states = [
      { id: 'watch', name: '1', effect: null, transitions: [{ id: 'branch', kind: 'if', when: { type: 'enemyInRange' }, to: 'engage', elseTo: 'advance', elseId: 'branch-else' }] },
      { id: 'engage', name: '2', effect: { type: 'autoAttackInRange' }, transitions: [] },
      { id: 'advance', name: '3', effect: { type: 'moveForward', tiles: 2 }, transitions: [] }
    ]
    policy.initialStateId = 'watch'
    const actor = window.gameState.humanPlayer || 'player1'
    const result = store.savePolicy(actor, policy)
    if (result?.ok === false) throw new Error(JSON.stringify(result))
    const editor = await import('/src/ui/policies/policyEditorModal.js')
    editor.openPolicyEditor({ policyId: policy.id })
  })
  await page.getByRole('dialog').waitFor()
  return { page, context }
}

async function capture(page, name) {
  await page.screenshot({ animations: 'disabled' }).then(buffer => sharp(buffer).webp({ quality: 85, effort: 4 }).toFile(path.join(output, `${name}.webp`)))
}

try {
  const desktop = await openScene({ width: 1440, height: 1080 })
  await capture(desktop.page, 'buttons-desktop')
  await desktop.page.getByRole('button', { name: 'Automation text view', exact: true }).click()
  await desktop.page.getByRole('textbox', { name: 'CFBL automation source' }).waitFor()
  await capture(desktop.page, 'cfbl-desktop')
  await desktop.context.close()
  const phone = await openScene({ width: 390, height: 844 }, true)
  await phone.page.getByRole('button', { name: 'Automation text view', exact: true }).click()
  await capture(phone.page, 'cfbl-phone')
  await phone.context.close()
} finally {
  await browser.close()
}
