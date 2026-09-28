import { mkdirSync } from 'fs'
import { chromium } from '@playwright/test'

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const outDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })

function log(message) {
  console.log(`[stats-verify] ${message}`)
}

async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
}

async function openGame(page) {
  const url = `${baseUrl}/?size=32&players=2&seed=4&oreFields=2`
  log(`open ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 90000 })
  await page.waitForFunction(() => window.gameState && window.gameState.gameStarted === true, null, { timeout: 90000 })
}

async function showMultiplayer(page) {
  await page.waitForSelector('#sidebar', { state: 'visible', timeout: 30000 })
  const collapsed = await page.evaluate(() => document.body.classList.contains('sidebar-collapsed'))
  if (collapsed) {
    await page.locator('#sidebarToggle').click()
    await page.waitForFunction(() => !document.body.classList.contains('sidebar-collapsed'))
  }
  const expanded = await page.evaluate(() => document.getElementById('multiplayerToggle')?.getAttribute('aria-expanded') === 'true')
  if (!expanded) await page.locator('#multiplayerToggle').click()
  await page.locator('#multiplayerContent').scrollIntoViewIfNeeded()
  await page.locator('#quickMatchBtn').waitFor({ state: 'visible', timeout: 15000 })
}

async function refreshPresence(page) {
  await page.evaluate(() => document.dispatchEvent(new Event('cfb-presence-refresh')))
}

const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] })
const hostContext = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const joinContext = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const host = await hostContext.newPage()
const joiner = await joinContext.newPage()

for (const page of [host, joiner]) {
  page.on('pageerror', error => log(`pageerror ${error.message}`))
}

try {
  await prepare(host)
  await prepare(joiner)
  await openGame(host)
  await openGame(joiner)
  await showMultiplayer(host)
  await showMultiplayer(joiner)

  await refreshPresence(joiner)
  await joiner.locator('#multiplayerPresenceLine').waitFor({ state: 'visible', timeout: 20000 })
  await refreshPresence(host)
  await host.waitForFunction(() => {
    const line = document.getElementById('multiplayerPresenceLine')
    return line && !line.hidden && /(?:[2-9]|\d{2,}) playing now/.test(line.textContent || '')
  }, null, { timeout: 20000 })
  await refreshPresence(joiner)
  await joiner.waitForFunction(() => {
    const line = document.getElementById('multiplayerPresenceLine')
    return line && !line.hidden && /(?:[2-9]|\d{2,}) playing now/.test(line.textContent || '')
  }, null, { timeout: 20000 })

  const hostLine = await host.locator('#multiplayerPresenceLine').innerText()
  const joinLine = await joiner.locator('#multiplayerPresenceLine').innerText()
  log(`host line: ${hostLine}`)
  log(`joiner line: ${joinLine}`)
  await host.locator('#multiplayerSettings').screenshot({ path: `${outDir}/multiplayer-presence-line.png` })

  await host.locator('[data-testid="multiplayer-invite-player2"]').click()
  await host.locator('.multiplayer-qr-modal.visible').waitFor({ state: 'visible', timeout: 20000 })
  const toggle = host.locator('.multiplayer-open-host__input')
  await toggle.check()
  await host.waitForFunction(() => document.querySelector('.multiplayer-open-host__input')?.checked === true)
  await host.locator('.multiplayer-qr-modal__dialog').screenshot({ path: `${outDir}/host-open-toggle.png` })
  log('open-host toggle checked')

  await showMultiplayer(joiner)
  await joiner.locator('#quickMatchBtn').click()
  await joiner.waitForURL(/invite=/, { timeout: 20000 })
  log(`joiner url ${joiner.url()}`)
  await joiner.locator('#remoteInviteLanding').waitFor({ state: 'visible', timeout: 30000 })
  await joiner.locator('#remoteAliasInput').fill('Red')
  await joiner.locator('#remoteInviteSubmit').click()
  await joiner.waitForFunction(() => {
    const session = window.gameState?.multiplayerSession
    return session && session.isRemote === true && session.status === 'connected'
  }, null, { timeout: 90000 })
  await host.waitForFunction(() => {
    const party = (window.gameState?.partyStates || []).find(entry => entry.partyId === 'player2')
    return party && party.aiActive === false
  }, null, { timeout: 30000 })
  await host.locator('.multiplayer-qr-modal__close').click().catch(() => {})
  await showMultiplayer(host)
  await host.locator('[data-testid="multiplayer-kick-player2"]').waitFor({ state: 'visible', timeout: 20000 })
  await host.locator('#multiplayerSettings').screenshot({ path: `${outDir}/quick-match-connected.png` })
  log('quick match connected')
} catch (error) {
  log(`failed: ${error?.stack || error}`)
  await host.screenshot({ path: `${outDir}/failure-host.png` }).catch(() => {})
  await joiner.screenshot({ path: `${outDir}/failure-joiner.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
