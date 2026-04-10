import { existsSync, renameSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LEGAL_ENTRY_DIR = resolve(__dirname, 'src/legal')
const LEGAL_OUTPUT_FILES = [
  'impressum.html',
  'imprint.html',
  'datenschutz.html',
  'privacy.html',
  'kontakt.html',
  'contact.html',
  'kontakt-erfolg.html',
  'contact-success.html'
]
const LEGAL_ROUTE_REWRITES = {
  '/impressum': '/src/legal/impressum.html',
  '/imprint': '/src/legal/imprint.html',
  '/datenschutz': '/src/legal/datenschutz.html',
  '/privacy': '/src/legal/privacy.html',
  '/kontakt': '/src/legal/kontakt.html',
  '/contact': '/src/legal/contact.html',
  '/kontakt-erfolg': '/src/legal/kontakt-erfolg.html',
  '/contact-success': '/src/legal/contact-success.html'
}

function getRewrittenLegalUrl(url = '') {
  const [pathname, suffix = ''] = url.split(/(?=[?#])/, 2)
  const normalizedPath = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname
  const target = LEGAL_ROUTE_REWRITES[normalizedPath]
  return target ? `${target}${suffix}` : null
}

const legalRoutePlugin = {
  name: 'legal-route-rewrite',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const rewrittenUrl = getRewrittenLegalUrl(req.url)
      if (rewrittenUrl) {
        req.url = rewrittenUrl
      }
      next()
    })
  },
  closeBundle() {
    const distLegalDir = resolve(__dirname, 'dist/src/legal')

    if (!existsSync(distLegalDir)) {
      return
    }

    for (const fileName of LEGAL_OUTPUT_FILES) {
      const sourcePath = resolve(distLegalDir, fileName)
      const targetPath = resolve(__dirname, 'dist', fileName)

      if (existsSync(sourcePath)) {
        renameSync(sourcePath, targetPath)
      }
    }

    rmSync(resolve(__dirname, 'dist/src'), { recursive: true, force: true })
  }
}

export default defineConfig({
  appType: 'mpa',
  plugins: [legalRoutePlugin],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        impressum: resolve(LEGAL_ENTRY_DIR, 'impressum.html'),
        imprint: resolve(LEGAL_ENTRY_DIR, 'imprint.html'),
        datenschutz: resolve(LEGAL_ENTRY_DIR, 'datenschutz.html'),
        privacy: resolve(LEGAL_ENTRY_DIR, 'privacy.html'),
        kontakt: resolve(LEGAL_ENTRY_DIR, 'kontakt.html'),
        contact: resolve(LEGAL_ENTRY_DIR, 'contact.html'),
        kontaktSuccess: resolve(LEGAL_ENTRY_DIR, 'kontakt-erfolg.html'),
        contactSuccess: resolve(LEGAL_ENTRY_DIR, 'contact-success.html')
      }
    }
  }
})
