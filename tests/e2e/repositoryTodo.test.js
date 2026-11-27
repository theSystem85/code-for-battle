import { test, expect } from '@playwright/test'
import { waitForLoadingScreenHidden } from './helpers/loadingScreen.js'

test.use({ hasTouch: true })

test('[E00290] browses archived TODOs and current playtest plans without losing modal or game state', async({ page }) => {
  await page.setViewportSize({ width: 412, height: 820 })
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
  })
  let requests = 0
  page.on('request', request => {
    if (request.url().endsWith('/_dev/todos')) requests++
  })
  await page.goto('/?seed=28')
  await waitForLoadingScreenHidden(page)
  await page.locator('#releaseNotesBtn').evaluate(button => button.click())
  const modal = page.getByRole('dialog', { name: 'Release notes' })
  await expect(modal.getByRole('tab', { name: 'Index' })).toHaveAttribute('aria-selected', 'true')
  expect(requests).toBe(0)
  await modal.getByRole('tab', { name: 'TODO' }).tap()
  const panel = modal.getByRole('tabpanel', { name: 'TODO' })
  await expect(panel.getByText(/^Needs clarification \d+$/)).toBeVisible()
  await panel.getByRole('button', { name: 'Awaiting QA' }).tap()
  await panel.getByText('Repository TODO management and in-game manual QA', { exact: true }).tap()
  await expect(panel.getByText('Manual test plan · 3 min')).toBeVisible()
  await expect(panel.getByText('Local build · deployed availability unknown', { exact: false })).toBeVisible()

  await panel.getByRole('combobox', { name: 'View', exact: true }).selectOption('Completed')
  await expect(panel.locator('summary')).toHaveCount(35)
  await panel.getByRole('button', { name: 'Next' }).tap()
  await expect(panel.getByText(/^2 \/ /)).toBeVisible()
  await panel.getByLabel('Search TODOs').fill('B-010')
  await panel.getByText('Production building spawn progress bar', { exact: true }).tap()
  await expect(panel.getByText('Archived completion.', { exact: false })).toBeVisible()
  await modal.getByRole('button', { name: 'Close release notes' }).tap()

  await page.setViewportSize({ width: 820, height: 412 })
  await page.locator('#releaseNotesBtn').evaluate(button => button.click())
  await expect(panel.getByLabel('Search TODOs')).toHaveValue('B-010')
  await expect(panel.getByText('Archived completion.', { exact: false })).toBeVisible()
  await page.route('**/_dev/todos', route => route.fulfill({ body: '<broken>' }))
  await panel.getByRole('button', { name: 'Refresh' }).tap()
  await expect(panel.getByRole('status')).toContainText('Showing the last loaded data')
  await expect(panel.getByText('Archived completion.', { exact: false })).toBeVisible()
  await modal.getByRole('tab', { name: 'Index' }).tap()
  await modal.getByRole('tabpanel', { name: 'Index' }).getByRole('link').first().tap()
  await expect(modal.getByRole('tab', { name: 'Releases' })).toHaveAttribute('aria-selected', 'true')
  const reference = modal.getByRole('button', { name: 'FEAT-77361c9a334540aebba139bd2302efb5' })
  await reference.tap()
  await expect(panel.getByLabel('Search TODOs')).toHaveValue('FEAT-77361c9a334540aebba139bd2302efb5')
  await expect(panel.getByText('Manual test plan · 3 min')).toBeVisible()
  await modal.getByRole('button', { name: 'Close release notes' }).tap()
  expect(await page.evaluate(() => window.gameState.gameStarted)).toBe(true)
})
