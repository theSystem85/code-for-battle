import { defineConfig, devices } from '@playwright/test'

const useNetlifyDev = process.env.PLAYWRIGHT_NETLIFY_DEV === '1'
const runHeaded = process.env.PLAYWRIGHT_HEADED === '1' || useNetlifyDev
const headlessE2eMuteAudio = !runHeaded
const baseURL = process.env.PLAYWRIGHT_BASE_URL || (useNetlifyDev ? 'http://localhost:8888' : 'http://localhost:5173')
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || (useNetlifyDev
  ? 'npx netlify dev --port 8888'
  : headlessE2eMuteAudio
    ? 'VITE_HEADLESS_E2E_MUTE_AUDIO=1 npm run dev'
    : 'npm run dev')
const launchArgs = !runHeaded ? ['--mute-audio'] : []
const storageState = headlessE2eMuteAudio ? './tests/e2e/headlessMutedStorageState.json' : undefined

/**
 * Playwright Configuration for RTS Game E2E Tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use */
  reporter: 'html',
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL,
    headless: !runHeaded,
    storageState,
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video recording on failure */
    video: 'on-first-retry',
    launchOptions: {
      args: launchArgs
    }
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: useNetlifyDev ? 180 * 1000 : 120 * 1000
  },

  /* Global timeout for each test */
  timeout: 120 * 1000,

  /* Expect timeout for assertions */
  expect: {
    timeout: 10000
  }
})
