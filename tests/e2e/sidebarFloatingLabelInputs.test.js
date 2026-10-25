import { test, expect } from '@playwright/test'

test.describe('Sidebar floating label inputs', () => {
  test('[E00107] renders compact floating labels with non-gradient borderless styling', async({ page }) => {
    await page.goto('/')

    await page.waitForSelector('#sidebar', { state: 'visible' })
    await page.click('#saveLoadToggle')
    await page.click('#multiplayerToggle')
    await page.click('#mapSettingsToggle')
    await expect(page.locator('#mapSettingsContent')).toBeVisible()

    await expect(page.locator('.multiplayer-join-label')).toHaveCount(0)

    const floatingWrappers = page.locator('#sidebar .floating-label-input')
    await expect(floatingWrappers).toHaveCount(35)
    await expect(page.locator('#lakeCount + label')).toHaveText('Lakes')
    await expect(page.locator('#decorativeTileCount')).toHaveValue('34')
    await expect(page.locator('#singleTreeCount + label')).toHaveText('Single trees')
    await expect(page.locator('#woodsCount + label')).toHaveText('Woods')
    await expect(page.locator('#otherVegetationCount + label')).toHaveText('Other vegetation')
    await expect(page.locator('#groundDetailCount + label')).toHaveText('Ground detail')
    await expect(page.locator('#cityDensityFactor')).toHaveValue('100')
    await page.locator('#stoneCount').fill('5')
    await expect(page.locator('#decorativeTileCount')).toHaveValue('38')
    await page.locator('#decorativeTileCount').fill('76')
    const partSum = await page.locator('#stoneCount, #singleTreeCount, #woodsCount, #otherVegetationCount, #groundDetailCount').evaluateAll(inputs => inputs.reduce((sum, input) => sum + Number(input.value), 0))
    await expect(page.locator('#decorativeTileCount')).toHaveValue(String(partSum))

    await expect(page.locator('#saveLabelInput + label')).toHaveText('Save label')
    await expect(page.locator('#inviteLinkInput + label')).toHaveText('Invite code or link')
    await expect(page.locator('label[for="speedMultiplier"]')).toContainText('Speed')
    await expect(page.locator('#mapSeed + label')).toHaveText('Seed')
    await expect(page.locator('#playerCount + label')).toHaveText('Players')
    await expect(page.locator('#playerAliasInput + label')).toHaveText('Your alias')
    await expect(page.locator('#mapWidthTiles + label')).toContainText('Width')
    await expect(page.locator('#mapHeightTiles + label')).toContainText('Height')

    const layoutSnapshot = await page.evaluate(() => {
      const top = selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -1
      const sameRow = (left, right) => Math.abs(top(left) - top(right)) < 1
      const aliasWrapper = document.querySelector('#playerAliasInput')?.closest('.floating-label-input')
      const joinInputRow = document.querySelector('.multiplayer-join-input-row')
      const joinSection = document.querySelector('.multiplayer-join-section')
      const sectionChildren = joinSection ? Array.from(joinSection.children) : []
      const aliasIndex = sectionChildren.indexOf(aliasWrapper)
      const joinRowIndex = sectionChildren.indexOf(joinInputRow)

      return {
        seedAndOreSameRow: sameRow('#mapSeed', '#mapOreFieldCount'),
        lakesAndTilesSameRow: sameRow('#lakeCount', '#decorativeTileCount'),
        stonesAndVegetationSameRow: sameRow('#stoneCount', '#otherVegetationCount'),
        treesAndWoodsSameRow: sameRow('#singleTreeCount', '#woodsCount'),
        clustersAndRadiusSameRow: sameRow('#woodClusterCount', '#woodClusterRadius'),
        detailAndCitySameRow: sameRow('#groundDetailCount', '#cityDensityFactor'),
        widthAndHeightSameRow: sameRow('#mapWidthTiles', '#mapHeightTiles'),
        aliasAboveJoinRow: aliasIndex >= 0 && joinRowIndex >= 0 && aliasIndex < joinRowIndex
      }
    })

    expect(layoutSnapshot.seedAndOreSameRow).toBe(true)
    expect(layoutSnapshot.lakesAndTilesSameRow).toBe(true)
    expect(layoutSnapshot.stonesAndVegetationSameRow).toBe(true)
    expect(layoutSnapshot.treesAndWoodsSameRow).toBe(true)
    expect(layoutSnapshot.clustersAndRadiusSameRow).toBe(true)
    expect(layoutSnapshot.detailAndCitySameRow).toBe(true)
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
