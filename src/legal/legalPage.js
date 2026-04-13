import { loadLegalConfig } from './legalConfig.js'

const PLACEHOLDER_TEXT = 'Please configure in impressum.config.json'
const CONTACT_RETENTION_DE = '3 Monate nach abschließender Bearbeitung'
const CONTACT_RETENTION_EN = '3 months after final processing'

function valueOrPlaceholder(value) {
  return value || PLACEHOLDER_TEXT
}

function cityLine(config) {
  return [config.postalCode, config.city].filter(Boolean).join(' ').trim() || PLACEHOLDER_TEXT
}

function displayNameLines(config) {
  const lines = []

  if (config.businessName) {
    lines.push(config.businessName)
  }

  if (config.fullName && config.fullName !== config.businessName) {
    lines.push(config.fullName)
  }

  return lines.length ? lines : [PLACEHOLDER_TEXT]
}

function addressLines(config) {
  const streetLine = [config.street, config.houseNumber].filter(Boolean).join(' ').trim()
  const lines = [config.addressLine1, streetLine].filter(Boolean)
  return lines.length ? lines : [PLACEHOLDER_TEXT]
}

function renderLines(lines) {
  return lines.map(valueOrPlaceholder).join('<br>\n      ')
}

function renderPostalBlock(config) {
  return renderLines([
    ...displayNameLines(config),
    ...addressLines(config),
    cityLine(config),
    config.country
  ])
}

function getLocalizedContactFormUrl(config, lang) {
  const configuredUrl = config.contactFormUrl

  if (!configuredUrl) {
    return ''
  }

  if (lang === 'de' && configuredUrl === '/contact') {
    return '/kontakt'
  }

  if (lang === 'en' && configuredUrl === '/kontakt') {
    return '/contact'
  }

  return configuredUrl
}

function legalLinks(lang) {
  if (lang === 'de') {
    return '<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a>'
  }
  return '<a href="/imprint">Imprint</a> · <a href="/privacy">Privacy</a>'
}

function renderImpressumDe(config) {
  const contactFormUrl = getLocalizedContactFormUrl(config, 'de')

  return `
    <h1>Impressum</h1>
    <p class="legal-last-updated">Stand: ${valueOrPlaceholder(config.lastUpdatedDe)}</p>

    <section>
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>${renderPostalBlock(config)}</p>
      ${config.representative ? `<p>Vertreten durch: ${config.representative}</p>` : ''}
    </section>

    <section>
      <h2>Kontakt</h2>
      <p>E-Mail: ${valueOrPlaceholder(config.email)}</p>
      ${config.phone ? `<p>Telefon: ${config.phone}</p>` : ''}
      ${contactFormUrl ? `<p>Kontaktformular: <a href="${contactFormUrl}">${contactFormUrl}</a></p>` : ''}
      ${config.website ? `<p>Webseite: ${config.website}</p>` : ''}
    </section>

    ${config.vatId ? `<section><h2>Umsatzsteuer-ID</h2><p>${config.vatId}</p></section>` : ''}

    ${config.responsiblePerson
    ? `<section><h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>${config.responsiblePerson}</p></section>`
    : ''}

    <section>
      <h2>Verbraucherstreitbeilegung</h2>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
    </section>

    <section>
      <h2>Hosting</h2>
      <p>Diese Website wird gehostet bei ${valueOrPlaceholder(config.hostingProviderName)}.<br>
      Anbieteranschrift: ${valueOrPlaceholder(config.hostingProviderAddress)}</p>
    </section>

    <section>
      <h2>Hinweis zu externen Links</h2>
      <p>Für Inhalte externer Links übernehmen wir trotz sorgfältiger Prüfung keine Haftung. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.</p>
    </section>

    <section>
      <h2>Urheberrechtshinweis</h2>
      <p>Die Inhalte und Werke auf dieser Website unterliegen dem Urheberrecht. Jede nicht gesetzlich erlaubte Verwertung bedarf der vorherigen Zustimmung des jeweiligen Rechteinhabers.</p>
    </section>
  `
}

function renderImprintEn(config) {
  const contactFormUrl = getLocalizedContactFormUrl(config, 'en')

  return `
    <h1>Imprint</h1>
    <p class="legal-last-updated">Last updated: ${valueOrPlaceholder(config.lastUpdatedEn)}</p>

    <section>
      <h2>Information pursuant to German legal requirements</h2>
      <p>${renderPostalBlock(config)}</p>
      ${config.representative ? `<p>Represented by: ${config.representative}</p>` : ''}
    </section>

    <section>
      <h2>Contact</h2>
      <p>Email: ${valueOrPlaceholder(config.email)}</p>
      ${config.phone ? `<p>Phone: ${config.phone}</p>` : ''}
      ${contactFormUrl ? `<p>Contact form: <a href="${contactFormUrl}">${contactFormUrl}</a></p>` : ''}
      ${config.website ? `<p>Website: ${config.website}</p>` : ''}
    </section>

    ${config.vatId ? `<section><h2>VAT ID</h2><p>${config.vatId}</p></section>` : ''}

    ${config.responsiblePerson
    ? `<section><h2>Person responsible for content</h2><p>${config.responsiblePerson}</p></section>`
    : ''}

    <section>
      <h2>Consumer dispute resolution</h2>
      <p>We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board.</p>
    </section>

    <section>
      <h2>Hosting</h2>
      <p>This website is hosted by ${valueOrPlaceholder(config.hostingProviderName)}.<br>
      Provider address: ${valueOrPlaceholder(config.hostingProviderAddress)}</p>
    </section>

    <section>
      <h2>External links disclaimer</h2>
      <p>We are not responsible for the content of external links. The operators of linked websites are solely responsible for their own content.</p>
    </section>

    <section>
      <h2>Copyright notice</h2>
      <p>All content and works published on this website are subject to copyright law. Any use not explicitly permitted by law requires prior consent from the respective rights holder.</p>
    </section>
  `
}

function renderPrivacyDe(config) {
  const privacyContact = config.privacyEmail || config.email
  return `
    <h1>Datenschutzerklärung</h1>
    <p class="legal-last-updated">Stand: ${valueOrPlaceholder(config.lastUpdatedDe)}</p>

    <section>
      <h2>Verantwortlicher</h2>
      <p>${renderPostalBlock(config)}</p>
      <p>Kontakt für Datenschutzanfragen: ${valueOrPlaceholder(privacyContact)}</p>
    </section>

    <section>
      <h2>Allgemeine Hinweise zur Datenverarbeitung</h2>
      <p>Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb dieser öffentlich zugänglichen Browser- und PWA-Anwendung technisch erforderlich ist oder Sie uns Daten aktiv übermitteln.</p>
    </section>

    <section>
      <h2>Hosting und Server-Logfiles</h2>
      <p>Die Anwendung wird bei ${valueOrPlaceholder(config.hostingProviderName)} gehostet. Beim Aufruf der Website verarbeitet der Hosting-Anbieter technisch erforderliche Verbindungsdaten, insbesondere IP-Adresse, Datum/Uhrzeit, angeforderte URL, Referrer, Browsertyp und Betriebssystem, um Stabilität, Auslieferung und Sicherheit der Plattform sicherzustellen.</p>
      <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt in dem sicheren und funktionsfähigen Betrieb des Angebots.</p>
    </section>

    <section>
      <h2>Kontaktaufnahme und Kontaktformular</h2>
      <p>Wenn Sie uns per E-Mail oder über das bereitgestellte Kontaktformular kontaktieren, verarbeiten wir Ihre Angaben zur Bearbeitung Ihrer Anfrage und für mögliche Rückfragen. Das Kontaktformular wird über Netlify Forms verarbeitet.</p>
      <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit Ihre Anfrage auf den Abschluss oder die Durchführung eines Vertrags gerichtet ist, andernfalls Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt in der effizienten Bearbeitung eingehender Anfragen.</p>
    </section>

    <section>
      <h2>Spielnutzung und Browser-Speicher</h2>
      <p>Bei der Nutzung des Spiels werden Spielstände, Replays, Komfort- und Grafikeinstellungen, Multiplayer-Aliasnamen sowie weitere technisch erforderliche Konfigurationswerte lokal im Browser gespeichert, vor allem über Local Storage. Session Storage wird derzeit nicht aktiv genutzt.</p>
      <p>Rechtsgrundlage für den Zugriff auf bzw. die Speicherung von Informationen auf Ihrem Endgerät ist § 25 Abs. 2 TDDDG, soweit dies technisch erforderlich ist. Die anschließende Verarbeitung personenbezogener Daten erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b oder lit. f DSGVO, um die von Ihnen gewünschten Spiel- und Komfortfunktionen bereitzustellen.</p>
    </section>

    <section>
      <h2>Mehrspieler, Signalisierung und WebRTC</h2>
      <p>Zur Bereitstellung von Mehrspieler-Funktionen verarbeitet die Anwendung netzwerkbezogene Metadaten, Signalisierungsdaten und verbindungsbezogene Informationen. Für Peer-to-Peer-Verbindungen wird WebRTC eingesetzt; dabei können IP-bezogene Netzwerk-Metadaten zwischen beteiligten Clients und der eingesetzten Infrastruktur verarbeitet werden.</p>
      <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Verarbeitung zur Bereitstellung der von Ihnen gewählten Mehrspieler-Funktion erforderlich ist, andernfalls Art. 6 Abs. 1 lit. f DSGVO für den stabilen technischen Betrieb.</p>
    </section>

    <section>
      <h2>Optionale Drittanbieter-APIs</h2>
      <p>Optional können Sie in den Einstellungen eigene API-Zugangsdaten für externe KI-Anbieter hinterlegen. Diese Funktion ist standardmäßig freiwillig und wird erst auf Ihre Veranlassung genutzt. Prüfen Sie die Datenschutzbedingungen der jeweils verwendeten Anbieter.</p>
      <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Bereitstellung der von Ihnen aktiv genutzten Funktion oder, soweit einschlägig, Ihre freiwillige Entscheidung zur Nutzung nach Art. 6 Abs. 1 lit. a DSGVO.</p>
    </section>

    <section>
      <h2>Empfänger und Auftragsverarbeiter</h2>
      <p>Empfänger der personenbezogenen Daten können technische Dienstleister sein, die wir für Hosting, Formverarbeitung und die Bereitstellung der Infrastruktur einsetzen. Derzeit betrifft dies insbesondere ${valueOrPlaceholder(config.hostingProviderName)} als Hosting- und Formularanbieter.</p>
    </section>

    <section>
      <h2>Drittlandübermittlungen</h2>
      <p>Im Rahmen des Hostings und der Formularverarbeitung kann eine Übermittlung personenbezogener Daten in die USA nicht ausgeschlossen werden. Nach Anbieterangaben stützt ${valueOrPlaceholder(config.hostingProviderName)} solche Übermittlungen auf eine Zertifizierung nach dem EU-U.S. Data Privacy Framework sowie ergänzend auf Standardvertragsklauseln, soweit erforderlich.</p>
    </section>

    <section>
      <h2>Speicherdauer</h2>
      <p>Server-Logfiles werden nur so lange gespeichert, wie dies für Sicherheits-, Fehleranalyse- und Betriebszwecke erforderlich ist, und anschließend gelöscht oder anonymisiert. Kontaktanfragen per E-Mail oder Formular speichern wir grundsätzlich für ${CONTACT_RETENTION_DE}, sofern keine gesetzlichen Aufbewahrungspflichten oder berechtigten Gründe für eine längere Aufbewahrung bestehen. Lokal im Browser gespeicherte Daten bleiben grundsätzlich erhalten, bis Sie diese selbst löschen oder Ihre Browserdaten zurücksetzen.</p>
    </section>

    <section>
      <h2>TLS-/SSL-Verschlüsselung</h2>
      <p>Die Website wird über HTTPS ausgeliefert. Dadurch werden übertragene Daten während der Kommunikation zwischen Ihrem Browser und dem Server verschlüsselt.</p>
    </section>

    <section>
      <h2>Analytics / Tracking</h2>
      <p>Aktuell werden nach bestem Wissen keine klassischen Web-Analytics- oder Tracking-Skripte (z. B. Google Analytics) eingebunden.</p>
    </section>

    <section>
      <h2>Ihre Rechte</h2>
      <p>Sie haben im gesetzlichen Rahmen insbesondere das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch.</p>
    </section>

    <section>
      <h2>Beschwerderecht bei einer Aufsichtsbehörde</h2>
      <p>Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung Ihrer personenbezogenen Daten zu beschweren.</p>
    </section>

    <section>
      <h2>Änderungen dieser Datenschutzerklärung</h2>
      <p>Wir behalten uns vor, diese Datenschutzerklärung bei technischen oder rechtlichen Änderungen anzupassen.</p>
    </section>
  `
}

function renderPrivacyEn(config) {
  const privacyContact = config.privacyEmail || config.email
  return `
    <h1>Privacy Policy</h1>
    <p class="legal-last-updated">Last updated: ${valueOrPlaceholder(config.lastUpdatedEn)}</p>

    <section>
      <h2>Data controller</h2>
      <p>${renderPostalBlock(config)}</p>
      <p>Privacy contact: ${valueOrPlaceholder(privacyContact)}</p>
    </section>

    <section>
      <h2>General information on processing</h2>
      <p>We process personal data only where necessary to operate this public browser game / PWA or where you actively provide data to us.</p>
    </section>

    <section>
      <h2>Hosting and server log files</h2>
      <p>The application is hosted by ${valueOrPlaceholder(config.hostingProviderName)}. When you visit the website, the hosting provider processes technically necessary connection data, in particular IP address, date/time, requested URL, referrer, browser type, and operating system, to ensure delivery, stability, and security of the platform.</p>
      <p>The legal basis is Art. 6(1)(f) GDPR. Our legitimate interest lies in the secure and reliable operation of the service.</p>
    </section>

    <section>
      <h2>Contact requests and contact form</h2>
      <p>If you contact us by email or through the provided contact form, we process your information to handle your request and any follow-up communication. The contact form is processed using Netlify Forms.</p>
      <p>The legal basis is Art. 6(1)(b) GDPR where your request relates to entering into or performing a contract; otherwise Art. 6(1)(f) GDPR applies. Our legitimate interest lies in efficiently handling incoming inquiries.</p>
    </section>

    <section>
      <h2>Game usage and browser storage</h2>
      <p>When you use the game, save states, replays, convenience and graphics settings, multiplayer aliases, and other technically necessary configuration values are stored locally in your browser, primarily via Local Storage. Session Storage is not currently used actively.</p>
      <p>The legal basis for accessing or storing information on your device is Section 25(2) TDDDG where this is technically necessary. Subsequent personal data processing is based on Art. 6(1)(b) or Art. 6(1)(f) GDPR in order to provide the game features you requested.</p>
    </section>

    <section>
      <h2>Multiplayer, signaling, and WebRTC</h2>
      <p>Multiplayer features process network metadata, signaling data, and connection-related information. Peer-to-peer connectivity uses WebRTC, which can involve processing IP-related network metadata between participating clients and the infrastructure used.</p>
      <p>The legal basis is Art. 6(1)(b) GDPR where the processing is necessary to provide the multiplayer function you selected, otherwise Art. 6(1)(f) GDPR for stable technical operation.</p>
    </section>

    <section>
      <h2>Optional third-party APIs</h2>
      <p>You may optionally configure your own API credentials for external AI providers in settings. This feature is voluntary and only used on your instruction. Please review the privacy terms of each provider you choose to use.</p>
      <p>The legal basis is Art. 6(1)(b) GDPR for providing the feature you actively use or, where applicable, your voluntary choice to use it under Art. 6(1)(a) GDPR.</p>
    </section>

    <section>
      <h2>Recipients and processors</h2>
      <p>Recipients of personal data may include technical service providers we use for hosting, form handling, and infrastructure delivery. At present this includes ${valueOrPlaceholder(config.hostingProviderName)} in particular as hosting and forms provider.</p>
    </section>

    <section>
      <h2>Transfers to third countries</h2>
      <p>As part of hosting and form processing, a transfer of personal data to the United States cannot be ruled out. According to the provider, ${valueOrPlaceholder(config.hostingProviderName)} relies on certification under the EU-U.S. Data Privacy Framework and, where required, supplementary Standard Contractual Clauses for such transfers.</p>
    </section>

    <section>
      <h2>Retention periods</h2>
      <p>Server log files are retained only as long as required for security, troubleshooting, and operational purposes and are then deleted or anonymized. Contact requests submitted by email or form are generally retained for ${CONTACT_RETENTION_EN}, unless statutory retention duties or legitimate reasons require longer retention. Data stored locally in your browser generally remains there until you delete it yourself or reset your browser data.</p>
    </section>

    <section>
      <h2>TLS / SSL encryption</h2>
      <p>The website is delivered over HTTPS. This encrypts data transmitted between your browser and the server during transport.</p>
    </section>

    <section>
      <h2>Analytics / tracking</h2>
      <p>To the best of our current knowledge, no classic web analytics or tracking scripts (for example Google Analytics) are embedded.</p>
    </section>

    <section>
      <h2>Your rights</h2>
      <p>Subject to statutory requirements, you have rights including access, rectification, erasure, restriction of processing, data portability, and objection.</p>
    </section>

    <section>
      <h2>Right to lodge a complaint</h2>
      <p>You have the right to lodge a complaint with a data protection supervisory authority regarding the processing of your personal data.</p>
    </section>

    <section>
      <h2>Changes to this privacy policy</h2>
      <p>We may update this privacy policy to reflect legal or technical changes.</p>
    </section>
  `
}

const renderers = {
  impressum: { lang: 'de', title: 'Impressum', render: renderImpressumDe },
  imprint: { lang: 'en', title: 'Imprint', render: renderImprintEn },
  datenschutz: { lang: 'de', title: 'Datenschutzerklärung', render: renderPrivacyDe },
  privacy: { lang: 'en', title: 'Privacy Policy', render: renderPrivacyEn }
}

async function init() {
  const pageType = document.body.dataset.legalPage
  const pageConfig = renderers[pageType]
  if (!pageConfig) return

  const config = await loadLegalConfig()

  document.title = `${pageConfig.title} | Code for Battle`
  document.getElementById('legalPageTitle').textContent = pageConfig.title
  document.getElementById('legalLanguageLinks').innerHTML = legalLinks(pageConfig.lang)
  document.getElementById('legalContent').innerHTML = pageConfig.render(config)
}

init()
