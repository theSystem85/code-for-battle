/**
 * Load the built-in demo save and replace the landing/docs gameplay shots.
 *
 *   npm run dev
 *   node scripts/captureLandingScreenshots.mjs
 *
 * Viewport sizes match the existing landing slots:
 * desktop 1254×784, phone landscape 845×392, phone portrait 391×846.
 */
import fs from 'fs'
import path from 'path'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

import { demoSave } from '../src/missions/mission_demo.js'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'
const OUT_DIR = path.join('public', 'images', 'docs')
const VERIFY_DIR = process.env.LANDING_VERIFY_DIR || '/tmp/landing-verify'
const FOCUS = demoSave.focus

const UI_SHOTS = [
  { name: 'GamePlayDesktop.webp', width: 1254, height: 784, mobile: false },
  { name: 'GamePlayLandscape.webp', width: 845, height: 392, mobile: true },
  { name: 'GamePlayPortrait.webp', width: 391, height: 846, mobile: true }
]

async function waitForBoot(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => (
    document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden') &&
    window.gameInstance &&
    window.gameState
  ), { timeout: 120000 })
}

async function loadDemo(page) {
  await page.evaluate(async () => {
    const mod = await import('/src/saveGame.js')
    mod.loadGame('builtin:demo')
  })
  await page.waitForFunction(() => (
    window.gameState?.currentSessionId === 'demo' &&
    Array.isArray(window.gameState.units) &&
    window.gameState.units.length > 20
  ), { timeout: 60000 })
  await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), { timeout: 120000 })
  await page.evaluate(() => {
    window.gameState.gameStarted = true
    window.gameState.gamePaused = false
    window.gameState.gameOver = false
    window.gameState.speedMultiplier = 3
    document.querySelectorAll('.notification').forEach(node => node.remove())
  })
}

async function frameBattle(page) {
  await page.evaluate(async ({ tileX, tileY }) => {
    const input = await import('/src/inputHandler.js')
    if (Array.isArray(input.selectedUnits)) input.selectedUnits.length = 0
    const canvas = document.getElementById('gameCanvas')
    const tile = 32
    const viewW = canvas?.clientWidth || window.innerWidth
    const viewH = canvas?.clientHeight || window.innerHeight
    const maxX = Math.max(0, window.gameState.mapTilesX * tile - viewW)
    const maxY = Math.max(0, window.gameState.mapTilesY * tile - viewH)
    window.gameState.scrollOffset.x = Math.max(0, Math.min(tileX * tile + tile / 2 - viewW / 2, maxX))
    window.gameState.scrollOffset.y = Math.max(0, Math.min(tileY * tile + tile / 2 - viewH / 2, maxY))
    window.gameState.smoothScroll.active = false
    document.querySelectorAll('.notification').forEach(node => node.remove())
  }, FOCUS)
}

async function waitForCombat(page) {
  const started = Date.now()
  let combat = { bullets: 0, explosions: 0 }
  while (Date.now() - started < 12000) {
    combat = await page.evaluate(async () => {
      const mod = await import('/src/game/gameOrchestrator.js')
      return {
        bullets: mod.bullets?.length || 0,
        explosions: window.gameState.explosions?.length || 0
      }
    })
    if (combat.bullets > 0 || combat.explosions > 0) break
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(700)
  return combat
}

async function hideChrome(page) {
  await page.addStyleTag({
    content: `
      #fpsDisplay, .notification, .tutorial-overlay, .tutorial-card, #gamepadCursor, .loading-screen {
        display: none !important;
      }
      * { cursor: none !important; }
    `
  })
}

async function shoot(page, file, options = {}) {
  await frameBattle(page)
  await page.waitForTimeout(options.settle || 350)
  const png = await page.screenshot({ type: 'png', animations: 'disabled' })
  await sharp(png).webp({ quality: options.quality || 85, effort: 4 }).toFile(file)
}

async function captureSet(browser, mobile) {
  const context = await browser.newContext({
    viewport: { width: UI_SHOTS[0].width, height: UI_SHOTS[0].height },
    deviceScaleFactor: 1,
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: 'no-preference'
  })
  await context.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts-game-master-volume', '0')
  })
  const page = await context.newPage()
  page.setDefaultTimeout(120000)
  await waitForBoot(page)
  await loadDemo(page)
  await hideChrome(page)
  const combat = await waitForCombat(page)
  console.log(`${mobile ? 'mobile' : 'desktop'} combat`, combat)
  return { context, page, combat }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(VERIFY_DIR, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio']
  })

  const desktop = await captureSet(browser, false)
  await desktop.page.setViewportSize({ width: 1254, height: 784 })
  await desktop.page.waitForTimeout(400)
  await shoot(desktop.page, path.join(OUT_DIR, 'GamePlayDesktop.webp'))
  console.log('wrote GamePlayDesktop.webp')

  await desktop.page.setViewportSize({ width: 1920, height: 1080 })
  await desktop.page.evaluate(() => {
    document.documentElement.style.setProperty('--sidebar-width', '0px')
    const sidebar = document.getElementById('sidebar')
    if (sidebar) sidebar.style.display = 'none'
    window.dispatchEvent(new Event('resize'))
  })
  await desktop.page.waitForTimeout(800)
  const backdropPng = await (async () => {
    await frameBattle(desktop.page)
    await desktop.page.waitForTimeout(500)
    return desktop.page.screenshot({ type: 'png', animations: 'disabled' })
  })()
  const backdrop = sharp(backdropPng)
  await backdrop.webp({ quality: 82, effort: 4 }).toFile(path.join(OUT_DIR, 'GamePlayBackdrop.webp'))
  await sharp(backdropPng)
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(path.join(OUT_DIR, 'GamePlayBackdropMobile.webp'))
  console.log('wrote backdrop')
  await desktop.context.close()

  const phone = await captureSet(browser, true)
  for (const shot of UI_SHOTS.filter(item => item.mobile)) {
    await phone.page.setViewportSize({ width: shot.width, height: shot.height })
    await phone.page.waitForTimeout(600)
    await shoot(phone.page, path.join(OUT_DIR, shot.name))
    console.log('wrote', shot.name)
  }
  await phone.context.close()
  await browser.close()

  const files = [
    'GamePlayDesktop.webp',
    'GamePlayLandscape.webp',
    'GamePlayPortrait.webp',
    'GamePlayBackdrop.webp',
    'GamePlayBackdropMobile.webp'
  ]
  for (const name of files) {
    const info = await sharp(path.join(OUT_DIR, name)).metadata()
    console.log(`${name} ${info.width}x${info.height} ${fs.statSync(path.join(OUT_DIR, name)).size} bytes`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
