import { beforeEach, describe, expect, it } from 'vitest'
import {
  createReleaseArchive, createReleaseIndex, initReleaseNotes,
  orderedReleaseEntries, releaseAnchor, releaseEntryAnchor
} from '../../src/ui/releaseNotes.js'

const entries = [
  { version: '1.2.0', features: ['Campaign mode'], improvements: ['Sharper map'], bugfixes: [] },
  { version: '1.10.0', features: [], improvements: [], bugfixes: ['Stable saves'] }
]

beforeEach(() => {
  document.body.innerHTML = `
    <button id="releaseNotesBtn">Release notes</button>
    <div id="releaseNotesModal" class="release-notes hidden" aria-hidden="true">
      <section class="release-notes__dialog">
        <button data-release-notes-close>Close</button>
        <div role="tablist">
          <button role="tab" data-release-tab="index" aria-selected="true">Index</button>
          <button role="tab" data-release-tab="releases" aria-selected="false">Releases</button>
        </div>
        <div id="releaseNotesIndexPanel" role="tabpanel" data-release-panel="index"></div>
        <div id="releaseNotesReleasesPanel" role="tabpanel" data-release-panel="releases" hidden></div>
      </section>
    </div>`
})

describe('release notes archive', () => {
  it('[U06995] orders releases by semantic version and creates stable anchors', () => {
    expect(orderedReleaseEntries(entries).map(entry => entry.version)).toEqual(['1.10.0', '1.2.0'])
    expect(releaseAnchor('1.10.0')).toBe('release-1-10-0')
    expect(releaseEntryAnchor('1.10.0', 'bugfixes', 0)).toBe('release-1-10-0-bugfixes-1')
  })

  it('[U06996] shares the digest renderer while indexing every release entry', () => {
    const host = document.createElement('div')
    host.append(createReleaseIndex(entries), createReleaseArchive(entries))
    expect(host.querySelectorAll('.release-notes__index-list > li')).toHaveLength(2)
    expect(host.querySelectorAll('.release-notes__index-list ul a')).toHaveLength(3)
    expect(host.querySelectorAll('.release-digest')).toHaveLength(2)
    expect(host.querySelector('#release-1-2-0-features-1').textContent).toBe('Campaign mode')
  })

  it('[U06997] opens accessibly and switches to Releases when an index link is activated', () => {
    Element.prototype.scrollIntoView = () => {}
    initReleaseNotes()
    document.getElementById('releaseNotesBtn').focus()
    document.getElementById('releaseNotesBtn').click()
    const modal = document.getElementById('releaseNotesModal')
    expect(modal.getAttribute('aria-hidden')).toBe('false')
    modal.querySelector('#releaseNotesIndexPanel a').click()
    expect(modal.querySelector('[data-release-tab="releases"]').getAttribute('aria-selected')).toBe('true')
    expect(document.getElementById('releaseNotesReleasesPanel').hidden).toBe(false)
    modal.querySelector('[data-release-notes-close]').click()
    expect(modal.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement.id).toBe('releaseNotesBtn')
  })
})
