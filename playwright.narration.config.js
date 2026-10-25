import config from './playwright.config.js'

// Keep the ordinary headless suite silent, but exercise real media decoding and
// ended events here. The test also asserts the app's mute guard is disabled.
export default {
  ...config,
  testIgnore: [],
  testMatch: '**/tutorialRecordedNarration.test.js',
  workers: 1,
  webServer: config.webServer && {
    ...config.webServer,
    command: 'VITE_HEADLESS_E2E_MUTE_AUDIO=0 npm run dev',
    reuseExistingServer: false
  },
  use: {
    ...config.use,
    launchOptions: {
      ...config.use.launchOptions,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {})
    }
  }
}
