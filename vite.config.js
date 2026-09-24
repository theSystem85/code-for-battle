import { existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import { LANDING_BUILD_MOVES, rewriteLandingUrl } from './src/landing/routes.js'

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

function rewriteStaticPageUrl(url = '', mode = 'dev') {
  if (mode === 'preview') {
    return rewriteLandingUrl(url, 'preview')
  }
  return getRewrittenLegalUrl(url) || rewriteLandingUrl(url, 'dev')
}

function attachStaticPageRoutes(server, mode) {
  server.middlewares.use((req, _res, next) => {
    const rewrittenUrl = rewriteStaticPageUrl(req.url, mode)
    if (rewrittenUrl) {
      req.url = rewrittenUrl
    }
    next()
  })
}

const legalRoutePlugin = {
  name: 'legal-route-rewrite',
  configureServer(server) {
    attachStaticPageRoutes(server, 'dev')
  },
  configurePreviewServer(server) {
    attachStaticPageRoutes(server, 'preview')
  },
  closeBundle() {
    const distDir = resolve(__dirname, 'dist')
    const distLegalDir = resolve(distDir, 'src/legal')

    if (existsSync(distLegalDir)) {
      for (const fileName of LEGAL_OUTPUT_FILES) {
        const sourcePath = resolve(distLegalDir, fileName)
        const targetPath = resolve(distDir, fileName)

        if (existsSync(sourcePath)) {
          renameSync(sourcePath, targetPath)
        }
      }
    }

    for (const [fromRel, toRel] of LANDING_BUILD_MOVES) {
      const sourcePath = resolve(distDir, fromRel)
      const targetPath = resolve(distDir, toRel)
      if (!existsSync(sourcePath)) continue
      mkdirSync(dirname(targetPath), { recursive: true })
      renameSync(sourcePath, targetPath)
    }

    rmSync(resolve(distDir, 'src'), { recursive: true, force: true })
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
        contactSuccess: resolve(LEGAL_ENTRY_DIR, 'contact-success.html'),
        landingEn: resolve(__dirname, 'src/landing/en.html'),
        landingDe: resolve(__dirname, 'src/landing/de.html'),
        landing: resolve(__dirname, 'src/landing/index.html')
      }
    }
  }
})
