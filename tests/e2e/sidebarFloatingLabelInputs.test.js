import { test, expect } from '@playwright/test'

test.describe('Sidebar floating label inputs', () => {
  test('renders compact floating labels with non-gradient borderless styling', async({ page }) => {
    await page.goto('/')

    await page.waitForSelector('#sidebar', { state: 'visible' })
    await page.click('#mapSettingsToggle')
    await expect(page.locator('#mapSettingsContent')).toBeVisible()

    await expect(page.locator('.multiplayer-join-label')).toHaveCount(0)

    const floatingWrappers = page.locator('#sidebar .floating-label-input')
    await expect(floatingWrappers).toHaveCount(8)

    await expect(page.locator('#saveLabelInput + label')).toHaveText('Save label')
    await expect(page.locator('#inviteLinkInput + label')).toHaveText('Join via invite link')
    await expect(page.locator('#speedMultiplier + label')).toHaveText('Game Speed')
    await expect(page.locator('#mapSeed + label')).toHaveText('Seed')
    await expect(page.locator('#playerCount + label')).toHaveText('Players')
    await expect(page.locator('#playerAliasInput + label')).toHaveText('Your alias')
    await expect(page.locator('#mapWidthTiles + label')).toHaveText('Width')
    await expect(page.locator('#mapHeightTiles + label')).toHaveText('Height')

    const layoutSnapshot = await page.evaluate(() => {
      const mapSeedRect = document.querySelector('#mapSeed')?.getBoundingClientRect()
      const playerCountRect = document.querySelector('#playerCount')?.getBoundingClientRect()
      const mapWidthRect = document.querySelector('#mapWidthTiles')?.getBoundingClientRect()
      const mapHeightRect = document.querySelector('#mapHeightTiles')?.getBoundingClientRect()
      const aliasWrapper = document.querySelector('#playerAliasInput')?.closest('.floating-label-input')
      const joinInputRow = document.querySelector('.multiplayer-join-input-row')
      const joinSection = document.querySelector('.multiplayer-join-section')
      const sectionChildren = joinSection ? Array.from(joinSection.children) : []
      const aliasIndex = sectionChildren.indexOf(aliasWrapper)
      const joinRowIndex = sectionChildren.indexOf(joinInputRow)

      return {
        seedAndPlayersSameRow: Math.abs((mapSeedRect?.top ?? 0) - (playerCountRect?.top ?? 0)) < 1,
        widthAndHeightSameRow: Math.abs((mapWidthRect?.top ?? 0) - (mapHeightRect?.top ?? 0)) < 1,
        aliasAboveJoinRow: aliasIndex >= 0 && joinRowIndex >= 0 && aliasIndex < joinRowIndex
      }
    })

    expect(layoutSnapshot.seedAndPlayersSameRow).toBe(true)
    expect(layoutSnapshot.widthAndHeightSameRow).toBe(true)
    expect(layoutSnapshot.aliasAboveJoinRow).toBe(true)

    const styleSnapshot = await page.evaluate(() => {
      const input = document.querySelector('#saveLabelInput')
      const label = document.querySelector('#saveLabelInput + label')
      const numberInput = document.querySelector('#mapSeed')
      const biomeSelect = document.querySelector('#integratedSpriteSheetBiomeSelect')
      const sidebarControls = Array.from(document.querySelectorAll('#sidebar input.sidebar-input, #sidebar select.sidebar-input'))
      const computedInput = window.getComputedStyle(input)
      const computedLabel = window.getComputedStyle(label)
      const computedNumber = window.getComputedStyle(numberInput)
      const computedSpin = window.getComputedStyle(numberInput, '::-webkit-inner-spin-button')
      const computedSelect = window.getComputedStyle(biomeSelect)
      const allSquareControls = sidebarControls.every(control => window.getComputedStyle(control).borderRadius === '0px')
      return {
        height: computedInput.height,
        borderTopWidth: computedInput.borderTopWidth,
        borderRadius: computedInput.borderRadius,
        backgroundImage: computedInput.backgroundImage,
        paddingTop: computedInput.paddingTop,
        paddingBottom: computedInput.paddingBottom,
        labelColor: computedLabel.color,
        numberColor: computedNumber.color,
        numberBackgroundColor: computedNumber.backgroundColor,
        spinnerColor: computedSpin.color,
        spinnerFilter: computedSpin.filter,
        spinnerBackgroundColor: computedSpin.backgroundColor,
        selectPaddingLeft: computedSelect.paddingLeft,
        selectPaddingRight: computedSelect.paddingRight,
        selectBackgroundPosition: computedSelect.backgroundPosition,
        allSquareControls
      }
    })

    expect(styleSnapshot.height).toBe('40px')
    expect(styleSnapshot.borderTopWidth).toBe('0px')
    expect(styleSnapshot.borderRadius).toBe('0px')
    expect(styleSnapshot.backgroundImage).toBe('none')
    expect(styleSnapshot.paddingTop).toBe('14px')
    expect(styleSnapshot.paddingBottom).toBe('2px')
    expect(styleSnapshot.labelColor).toBe('rgb(110, 252, 75)')
    expect(styleSnapshot.spinnerColor).toBe(styleSnapshot.numberColor)
    expect(styleSnapshot.spinnerFilter).toBe('none')
    expect(styleSnapshot.spinnerBackgroundColor).toBe(styleSnapshot.numberBackgroundColor)
    expect(styleSnapshot.selectPaddingLeft).toBe('12px')
    expect(styleSnapshot.selectPaddingRight).toBe('36px')
    expect(styleSnapshot.selectBackgroundPosition).toContain('calc(100% - 12px)')
    expect(styleSnapshot.allSquareControls).toBe(true)
  })
})
