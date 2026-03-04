import { test, expect } from '@playwright/test'

test('allows mixed-provider LLM model pool and per-party Local/LLM assignment', async({ page }) => {
  await page.route('**/models', async route => {
    const url = route.request().url()
    if (url.includes('inceptionlabs')) {
      await route.fulfill({ json: { data: [{ id: 'mercury-m2' }] } })
      return
    }
    await route.fulfill({ json: { data: [{ id: 'gpt-5-nano' }] } })
  })

  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    localStorage.setItem('rts_llm_settings', JSON.stringify({
      strategic: {
        enabled: true,
        tickSeconds: 60,
        provider: 'openai',
        verbosity: 'minimal',
        maxActions: 50
      },
      commentary: {
        enabled: false,
        provider: 'openai',
        promptOverride: '',
        ttsEnabled: true,
        voiceName: ''
      },
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-5-nano',
          riskAccepted: true
        },
        inceptionlabs: {
          apiKey: 'test-inception-key',
          baseUrl: 'https://api.inceptionlabs.ai/v1',
          model: 'mercury-m2',
          riskAccepted: true
        }
      },
      strategicModelPool: []
    }))
  })

  await page.goto('/?seed=11')
  await page.waitForSelector('#multiplayerPartyList')

  await page.click('#mapSettingsBtn')
  await expect(page.locator('#configSettingsModal')).toHaveClass(/config-modal--open/)

  await page.selectOption('#llmPoolProvider', 'inceptionlabs')
  await page.selectOption('#llmPoolModel', 'mercury-m2')
  await page.fill('#llmPoolInterval', '15')
  await page.click('#llmPoolAddButton')
  await expect(page.locator('#llmPoolList')).toContainText('mercury-m2 (15s)')

  await page.selectOption('#llmPoolProvider', 'openai')
  await page.selectOption('#llmPoolModel', 'gpt-5-nano')
  await page.fill('#llmPoolInterval', '60')
  await page.click('#llmPoolAddButton')
  await expect(page.locator('#llmPoolList')).toContainText('gpt-5-nano (60s)')

  const partySelect = page.locator('[data-testid="multiplayer-llm-select-player2"]')
  await expect(partySelect).toBeVisible()
  await expect(partySelect.locator('option')).toContainText(['⚙️ Local', '🤖 mercury-m2 (15s)', '🤖 gpt-5-nano (60s)'])

  await partySelect.selectOption('inceptionlabs:mercury-m2')
  await expect.poll(async() => page.evaluate(() => {
    const p2 = window.gameState?.partyStates?.find(p => p.partyId === 'player2')
    return { llmControlled: p2?.llmControlled, llmModelKey: p2?.llmModelKey }
  })).toEqual({ llmControlled: true, llmModelKey: 'inceptionlabs:mercury-m2' })

  await partySelect.selectOption('local')
  await expect.poll(async() => page.evaluate(() => {
    const p2 = window.gameState?.partyStates?.find(p => p.partyId === 'player2')
    return { llmControlled: p2?.llmControlled, llmModelKey: p2?.llmModelKey }
  })).toEqual({ llmControlled: false, llmModelKey: null })
})
