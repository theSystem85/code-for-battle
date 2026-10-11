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
    const store = await import('/src/policies/policyStore.js')
    const actor = window.gameState.humanPlayer || 'player1'
    const result = store.saveAutomationSource(actor, {
      id: 'landing-automation-example', name: 'Engage or advance', source: `control unit {
  scope individual;
  run once;
  start 1;
  state 1 {
    do wait;
    if (enemyInRange) goto 2;
    else goto 3;
  }
  state 2 { do autoAttackInRange(); }
  state 3 { do moveForward(tiles=2); }
}` })
    if (!result.ok) throw new Error(JSON.stringify(result))
    const editor = await import('/src/ui/policies/policyEditorModal.js')
    editor.openPolicyEditor({ policyId: 'landing-automation-example' })
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
  const sourceInput = desktop.page.getByRole('textbox', { name: 'CFBL automation source' })
  const source = await sourceInput.inputValue()
  if (!source.includes('else goto 3') || !source.includes('autoAttackInRange')) throw new Error('Captured editor does not contain the saved source fixture')
  await fs.writeFile(path.join(output, 'source-fixture.cfbl'), source + '\n')
  await sourceInput.evaluate(input => {
    const start = input.value.indexOf('autoAttackInRange')
    input.focus()
    input.setSelectionRange(start, start + 'autoAttackInRange'.length)
  })
  await desktop.page.getByRole('button', { name: 'Choose next token', exact: true }).click()
  await desktop.page.getByRole('searchbox', { name: 'Search legal CFBL options' }).fill('atk')
  if (await desktop.page.getByRole('option').count() === 0) throw new Error('Fuzzy flyout has no legal choices')
  await capture(desktop.page, 'cfbl-desktop')
  await desktop.page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await desktop.page.evaluate(async () => {
    const save = await import('/src/saveGame.js')
    save.loadGame('builtin:Full_Base_Test')
  })
  await desktop.page.waitForFunction(() => window.gameState.currentSessionId === 'Full_Base_Test' && document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), { timeout: 120000 })
  const defence = await desktop.page.evaluate(async () => {
    const store = await import('/src/policies/policyStore.js')
    const capabilities = await import('/src/policies/defenceCapabilities.js')
    const commands = await import('/src/policies/defenceCommandApi.js')
    const actor = window.gameState.humanPlayer || 'player1'
    const building = window.gameState.buildings.find(item => item.owner === actor && item.type === 'turretGunV1' && capabilities.isDefenceReady(item))
    if (!building) throw new Error('Demo has no owned ready defence building')
    const policyId = 'landing-defence-example'
    const result = store.saveAutomationSource(actor, { id: policyId, name: 'Hold fire while damaged', source: `control defence-building {
  scope individual;
  run continuous;
  start 1;
  state 1 {
    do wait;
    while (hp().relative < 0.5) until (hp().relative >= 0.75) goto 2;
  }
  state 2 { do holdFire(); }
}` })
    if (!result.ok) throw new Error(JSON.stringify(result))
    const applied = store.applyPolicyToBuilding(actor, building, policyId)
    if (!applied.ok) throw new Error(JSON.stringify(applied))
    commands.releaseDefenceManualOverride(building)
    building.health = Math.max(1, building.maxHealth * 0.3)
    window.gameState.scrollOffset.x = Math.max(0, building.x * 32 - 450)
    window.gameState.scrollOffset.y = Math.max(0, building.y * 32 - 400)
    window.gameState.smoothScroll.active = false
    window.gameState.gamePaused = false
    return { id: building.id, type: building.type }
  })
  await desktop.page.waitForFunction(async id => {
    const engine = await import('/src/policies/defencePolicyEngine.js')
    const building = window.gameState.buildings.find(item => item.id === id)
    return engine.getDefencePolicySummary(building).some(item => item.holding && item.active)
  }, defence.id, { timeout: 30000 })
  const summary = await desktop.page.evaluate(async id => {
    window.gameState.gamePaused = true
    const building = window.gameState.buildings.find(item => item.id === id)
    const view = await import('/src/ui/policies/policyMachineView.js')
    view.openPolicyMachineView(building)
    const engine = await import('/src/policies/defencePolicyEngine.js')
    return engine.getDefencePolicySummary(building)
  }, defence.id)
  if (!summary.some(item => item.holding && item.active && item.stateIndex === 2)) throw new Error('Captured defence no longer has its active live hold')
  await fs.writeFile(path.join(output, 'defence-status.json'), JSON.stringify({ building: defence, summary }, null, 2) + '\n')
  await desktop.page.evaluate(() => document.querySelectorAll('.notification').forEach(node => node.remove()))
  await capture(desktop.page, 'defence-live')
  await desktop.context.close()
  const phone = await openScene({ width: 390, height: 844 }, true)
  await phone.page.getByRole('button', { name: 'Automation text view', exact: true }).click()
  if (await phone.page.getByRole('textbox', { name: 'CFBL automation source' }).inputValue() !== source) throw new Error('Phone program differs from desktop source')
  const bounds = await phone.page.getByRole('dialog').boundingBox()
  if (!bounds || bounds.x !== 0 || bounds.y !== 0 || bounds.width !== 390 || bounds.height !== 844) throw new Error(`Phone dialog is not full screen: ${JSON.stringify(bounds)}`)
  await capture(phone.page, 'cfbl-phone')
  await phone.context.close()
} finally {
  await browser.close()
}
