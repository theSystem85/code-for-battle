import { expect, test, devices } from '@playwright/test'

async function startGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
}

async function newUnitAutomation(page) {
  await page.locator('#policiesBtn').click()
  await page.locator('#newPolicyBtn').click()
  return page.locator('.policy-editor')
}

test('DAV and guided CFBL share changes, legal choices, history and persisted source', async({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await startGame(page)
  const editor = await newUnitAutomation(page)
  await editor.getByLabel('Automation name', { exact: true }).fill('Integration patrol')
  await editor.getByRole('button', { name: '+ Add state', exact: true }).click()
  await editor.getByLabel('State 2 action', { exact: true }).selectOption('moveForward')
  await editor.getByRole('button', { name: '+ rule', exact: true }).first().click()
  await editor.getByRole('button', { name: 'Add ELSE', exact: true }).click()
  await editor.getByLabel('ELSE target state', { exact: true }).selectOption({ label: 'State 2' })
  await editor.getByRole('button', { name: 'Automation text view', exact: true }).click()
  const source = editor.getByRole('textbox', { name: 'CFBL automation source', exact: true })
  const original = await source.inputValue()
  expect(original).toContain('moveForward(tiles=2)')
  expect(original).toMatch(/else goto 2;/)
  expect(original).toContain('state 1')
  expect(original).toContain('state 2')
  expect(await page.evaluate(() => window.gameState.gamePaused)).toBe(true)

  await source.evaluate(element => {
    const start = element.value.indexOf('moveForward')
    element.focus()
    element.setSelectionRange(start, start + 'moveForward'.length)
  })
  await editor.getByRole('button', { name: 'Choose next token', exact: true }).click()
  await editor.getByRole('searchbox', { name: 'Search legal CFBL options', exact: true }).fill('mvbk')
  await editor.getByRole('option').filter({ hasText: 'moveBackward' }).first().click()
  await expect(source).toHaveValue(original.replace('moveForward', 'moveBackward'))
  await editor.getByRole('button', { name: 'Default automation view', exact: true }).click()
  await expect(editor.getByLabel('State 2 action', { exact: true })).toHaveValue('moveBackward')
  await editor.getByRole('button', { name: 'Automation text view', exact: true }).click()
  await editor.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(source).toHaveValue(original)
  await editor.getByRole('button', { name: 'Redo', exact: true }).click()
  const accepted = await source.inputValue()
  await source.evaluate(element => {
    element.setSelectionRange(0, element.value.length)
    const clipboardData = new window.DataTransfer()
    clipboardData.setData('text/plain', 'control unit { do arbitraryJavaScript(); }')
    element.dispatchEvent(new window.ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(source).toHaveValue(accepted)
  await editor.getByRole('button', { name: 'Save automation', exact: true }).click()
  await expect(editor).toBeHidden()
  await page.locator('#policiesBtn').click()
  const card = page.locator('.policy-card').filter({ hasText: 'Integration patrol' })
  await card.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Automation text view', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'CFBL automation source', exact: true })).toHaveValue(accepted)
  expect(errors).toEqual([])
})

for (const [deviceName, fullScreen] of [['iPhone 13', true], ['iPad Pro 11', false]]) {
  test(`${deviceName} uses the correct Automation modal and preserves source on rotation`, async({ browser }) => {
    const context = await browser.newContext({ ...devices[deviceName], defaultBrowserType: undefined })
    const page = await context.newPage()
    try {
      await startGame(page)
      const editor = await newUnitAutomation(page)
      const box = await editor.boundingBox()
      const viewport = page.viewportSize()
      if (fullScreen) {
        expect(box.width).toBeCloseTo(viewport.width, 0)
        expect(box.height).toBeCloseTo(viewport.height, 0)
      } else {
        expect(box.height).toBeLessThan(viewport.height)
        expect(await editor.evaluate(element => window.getComputedStyle(element).borderRadius)).not.toBe('0px')
      }
      await editor.getByRole('button', { name: 'Automation text view', exact: true }).click()
      const source = editor.getByRole('textbox', { name: 'CFBL automation source', exact: true })
      const code = await source.inputValue()
      await page.setViewportSize({ width: viewport.height, height: viewport.width })
      await expect(source).toHaveValue(code)
      await expect(editor.getByRole('button', { name: 'Save automation', exact: true })).toBeVisible()
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(editor).toBeHidden()
    } finally { await context.close() }
  })
}

for (const [variant, header, effect] of [
  ['unit', 'control unit', 'moveForward'],
  ['defence', 'control defence-building', 'holdFire'],
  ['unitBuild', 'build unit', 'buildUnits'],
  ['build', 'build building', 'buildBuilding']
]) {
  test(`${header} can be authored in Buttons and saved as synchronized CFBL`, async({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await startGame(page)
    const editor = await newUnitAutomation(page)
    await editor.getByLabel('Automation type', { exact: true }).selectOption(variant)
    await editor.getByLabel('Automation name', { exact: true }).fill(`Category ${variant}`)
    await editor.getByLabel('State 1 action', { exact: true }).selectOption(effect)
    await editor.getByRole('button', { name: 'Automation text view', exact: true }).click()
    const source = editor.getByRole('textbox', { name: 'CFBL automation source', exact: true })
    const accepted = await source.inputValue()
    expect(accepted).toContain(header)
    expect(accepted).toContain(`${effect}(`)
    await editor.getByRole('button', { name: 'Default automation view', exact: true }).click()
    await expect(editor.getByLabel('State 1 action', { exact: true })).toHaveValue(effect)
    await editor.getByRole('button', { name: 'Save automation', exact: true }).click()
    await expect(editor).toBeHidden()
    await page.locator('#policiesBtn').click()
    await page.locator('.policy-card').filter({ hasText: `Category ${variant}` }).getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Automation text view', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'CFBL automation source', exact: true })).toHaveValue(accepted)
    expect(errors).toEqual([])
  })
}
