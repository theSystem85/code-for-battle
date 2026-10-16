// Hidden locators also accept an absent overlay. Allow the bounded renderer boot wait.
export async function waitForLoadingScreenHidden(page) {
  await page.locator('#loadingScreen').waitFor({ state: 'hidden', timeout: 60000 })
}
