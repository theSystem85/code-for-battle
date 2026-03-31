import { loadLegalConfig } from './legalConfig.js'

const PLACEHOLDER_TEXT = 'Please configure in impressum.config.json'

function valueOrPlaceholder(value) {
  return value || PLACEHOLDER_TEXT
}

function contactLine(config) {
  return [config.street, config.houseNumber].filter(Boolean).join(' ').trim() || PLACEHOLDER_TEXT
}

function cityLine(config) {
  return [config.postalCode, config.city].filter(Boolean).join(' ').trim() || PLACEHOLDER_TEXT
}

function legalLinks(lang) {
  if (lang === 'de') {
    return '<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a>'
  }
  return '<a href="/imprint">Imprint</a> · <a href="/privacy">Privacy</a>'
}

function renderImpressumDe(config) {
  return `
    <h1>Impressum</h1>
    <p class="legal-last-updated">Stand: ${valueOrPlaceholder(config.lastUpdatedDe)}</p>

    <section>
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>${valueOrPlaceholder(config.businessName || config.fullName)}<br>
      ${contactLine(config)}<br>
      ${cityLine(config)}<br>
      ${valueOrPlaceholder(config.country)}</p>
      ${config.representative ? `<p>Vertreten durch: ${config.representative}</p>` : ''}
    </section>

    <section>
      <h2>Kontakt</h2>
      <p>E-Mail: ${valueOrPlaceholder(config.email)}</p>
      ${config.phone ? `<p>Telefon: ${config.phone}</p>` : ''}
      ${config.website ? `<p>Webseite: ${config.website}</p>` : ''}
    </section>

    ${config.vatId ? `<section><h2>Umsatzsteuer-ID</h2><p>${config.vatId}</p></section>` : ''}

    ${config.responsiblePerson
    ? `<section><h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>${config.responsiblePerson}</p></section>`
    : ''}

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
  return `
    <h1>Imprint</h1>
    <p class="legal-last-updated">Last updated: ${valueOrPlaceholder(config.lastUpdatedEn)}</p>

    <section>
      <h2>Information pursuant to German legal requirements</h2>
      <p>${valueOrPlaceholder(config.businessName || config.fullName)}<br>
      ${contactLine(config)}<br>
      ${cityLine(config)}<br>
      ${valueOrPlaceholder(config.country)}</p>
      ${config.representative ? `<p>Represented by: ${config.representative}</p>` : ''}
    </section>

    <section>
      <h2>Contact</h2>
      <p>Email: ${valueOrPlaceholder(config.email)}</p>
      ${config.phone ? `<p>Phone: ${config.phone}</p>` : ''}
      ${config.website ? `<p>Website: ${config.website}</p>` : ''}
    </section>

    ${config.vatId ? `<section><h2>VAT ID</h2><p>${config.vatId}</p></section>` : ''}

    ${config.responsiblePerson
    ? `<section><h2>Person responsible for content</h2><p>${config.responsiblePerson}</p></section>`
    : ''}

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
      <p>${valueOrPlaceholder(config.businessName || config.fullName)}<br>
      ${contactLine(config)}<br>
      ${cityLine(config)}<br>
      ${valueOrPlaceholder(config.country)}</p>
      <p>Kontakt für Datenschutzanfragen: ${valueOrPlaceholder(privacyContact)}</p>
    </section>

    <section>
      <h2>Allgemeine Hinweise zur Datenverarbeitung</h2>
      <p>Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb dieser öffentlich zugänglichen Browser- und PWA-Anwendung technisch erforderlich ist oder Sie uns Daten aktiv übermitteln.</p>
    </section>

    <section>
      <h2>Hosting</h2>
      <p>Die Anwendung wird bei ${valueOrPlaceholder(config.hostingProviderName)} gehostet. Dabei kann es zur Verarbeitung von Verbindungsdaten in Server-Logfiles kommen.</p>
    </section>

    <section>
      <h2>Server-Logfiles</h2>
      <p>Beim Aufruf der Website werden technisch erforderliche Informationen wie IP-Adresse, Datum/Uhrzeit, aufgerufene URL, Referrer, Browsertyp und Betriebssystem verarbeitet, um Stabilität und Sicherheit der Plattform sicherzustellen.</p>
    </section>

    <section>
      <h2>Kontaktaufnahme</h2>
      <p>Wenn Sie uns per E-Mail kontaktieren, verarbeiten wir Ihre Angaben zur Bearbeitung Ihrer Anfrage und für mögliche Rückfragen.</p>
    </section>

    <section>
      <h2>Spielnutzung</h2>
      <p>Bei der Nutzung des Spiels werden Spielzustände und Einstellungen lokal im Browser gespeichert (z. B. Local Storage), damit Funktionen wie Spielstände, Replays, Konfiguration und Komforteinstellungen funktionieren.</p>
    </section>

    <section>
      <h2>Technisch notwendige Datenverarbeitung</h2>
      <p>Zur Bereitstellung von Mehrspieler-Funktionen verarbeitet die Anwendung netzwerkbezogene Metadaten und Signalisierungsdaten. Außerdem werden API-Aufrufe genutzt, um Sitzungen technisch zu koordinieren.</p>
    </section>

    <section>
      <h2>Browser-Speicher (Local Storage / Session Storage)</h2>
      <p>Das Projekt verwendet vor allem Local Storage. Session Storage wird derzeit nicht aktiv genutzt, kann aber bei künftigen technischen Erweiterungen hinzukommen.</p>
    </section>

    <section>
      <h2>WebRTC und Peer-to-Peer-Kommunikation</h2>
      <p>Für Multiplayer-Verbindungen wird WebRTC eingesetzt. Dabei können Verbindungsdaten wie IP-bezogene Netzwerk-Metadaten zwischen beteiligten Clients und der eingesetzten Infrastruktur verarbeitet werden.</p>
    </section>

    <section>
      <h2>Drittanbieter-APIs (optional)</h2>
      <p>Optional können Sie in den Einstellungen eigene API-Zugangsdaten für externe KI-Anbieter hinterlegen. Diese Funktion ist standardmäßig optional und liegt in Ihrer Verantwortung. Prüfen Sie die Datenschutzbedingungen der jeweils verwendeten Anbieter.</p>
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
      <p>${valueOrPlaceholder(config.businessName || config.fullName)}<br>
      ${contactLine(config)}<br>
      ${cityLine(config)}<br>
      ${valueOrPlaceholder(config.country)}</p>
      <p>Privacy contact: ${valueOrPlaceholder(privacyContact)}</p>
    </section>

    <section>
      <h2>General information on processing</h2>
      <p>We process personal data only where necessary to operate this public browser game / PWA or where you actively provide data to us.</p>
    </section>

    <section>
      <h2>Hosting</h2>
      <p>The application is hosted by ${valueOrPlaceholder(config.hostingProviderName)}. Connection data may be processed in server log files.</p>
    </section>

    <section>
      <h2>Server log files</h2>
      <p>When visiting this website, technical information such as IP address, date/time, requested URL, referrer, browser type, and operating system may be processed to ensure stability and security.</p>
    </section>

    <section>
      <h2>Contact requests</h2>
      <p>If you contact us by email, we process your information to handle your request and any follow-up communication.</p>
    </section>

    <section>
      <h2>Game usage</h2>
      <p>The game stores game states and settings locally in your browser (for example using Local Storage) so that savegames, replays, configuration, and convenience features can function.</p>
    </section>

    <section>
      <h2>Technically necessary processing</h2>
      <p>Multiplayer features process network metadata and signaling data. API requests are also used for technical session coordination.</p>
    </section>

    <section>
      <h2>Browser storage (Local Storage / Session Storage)</h2>
      <p>The project primarily uses Local Storage. Session Storage is currently not actively used, but may be used in future technical updates.</p>
    </section>

    <section>
      <h2>WebRTC and peer-to-peer networking</h2>
      <p>Multiplayer connectivity uses WebRTC. This can involve processing connection-related metadata, including IP-related network information between clients and infrastructure.</p>
    </section>

    <section>
      <h2>Third-party APIs (optional)</h2>
      <p>You may optionally configure your own API credentials for external AI providers in settings. This feature is optional and used at your discretion. Please review each provider's privacy terms.</p>
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
