import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  configureMilestoneVideo,
  milestoneSignalMotionEnabled,
  milestoneVideoPlacement,
  MILESTONE_SIGNAL_ACQUIRE_CLASS,
  MILESTONE_SIGNAL_ACQUIRE_MS,
  MILESTONE_SIGNAL_CHIRP,
  MILESTONE_SIGNAL_CHIRP_VOLUME,
  MILESTONE_SIGNAL_RELEASE_CLASS,
  MILESTONE_PRESENTATION_FADE_MS,
  PORTRAIT_COLLAPSED_RADAR_BOTTOM,
  PORTRAIT_CONDENSED_RADAR_BOTTOM,
  PORTRAIT_RADAR_RIGHT,
  PORTRAIT_RADAR_VIDEO_HEIGHT_PX,
  PORTRAIT_RADAR_VIDEO_WIDTH_PX,
  portraitMinimapPlacement
} from '../../src/ui/milestoneVideoPresentation.js'
import { VideoOverlay } from '../../src/ui/videoOverlay.js'

const RADAR_SIZE = {
  anchor: 'bottom-right',
  width: 250,
  height: 150
}

function overlayCss() {
  return [...document.head.querySelectorAll('style')].map(node => node.textContent).join('\n')
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expectPortraitRadarRule(css, sidebar, bottom) {
  const rule = new RegExp(
    `body\\.mobile-portrait\\.${sidebar} #video-overlay\\.native-video\\s*\\{[^}]*` +
    `right:\\s*${escapeRegExp(PORTRAIT_RADAR_RIGHT)};[^}]*` +
    `bottom:\\s*${escapeRegExp(bottom)};[^}]*` +
    `width:\\s*${PORTRAIT_RADAR_VIDEO_WIDTH_PX}px;[^}]*` +
    `height:\\s*${PORTRAIT_RADAR_VIDEO_HEIGHT_PX}px;[^}]*` +
    'aspect-ratio:\\s*5\\s*/\\s*3;'
  )
  expect(css).toMatch(rule)
}

afterEach(() => {
  document.body.className = ''
  vi.useRealTimers()
})

describe('milestone video presentation', () => {
  it('[U02799] anchors collapsed portrait video on the bottom-right radar', () => {
    document.body.className = 'mobile-portrait sidebar-collapsed'
    expect(milestoneVideoPlacement(document.body, null)).toEqual(portraitMinimapPlacement('collapsed'))
    expect(portraitMinimapPlacement('collapsed')).toMatchObject({
      ...RADAR_SIZE,
      mode: 'portrait-minimap',
      layout: 'collapsed',
      right: PORTRAIT_RADAR_RIGHT,
      bottom: PORTRAIT_COLLAPSED_RADAR_BOTTOM
    })
    expect(PORTRAIT_RADAR_VIDEO_WIDTH_PX / PORTRAIT_RADAR_VIDEO_HEIGHT_PX).toBeCloseTo(5 / 3, 5)
  })

  it('[U05474] anchors condensed portrait video on the bottom-right radar', () => {
    const condensed = portraitMinimapPlacement('condensed')
    expect(condensed).toMatchObject({
      ...RADAR_SIZE,
      mode: 'portrait-minimap',
      layout: 'condensed',
      right: PORTRAIT_RADAR_RIGHT,
      bottom: PORTRAIT_CONDENSED_RADAR_BOTTOM
    })
    expect(PORTRAIT_RADAR_VIDEO_WIDTH_PX).toBe(250)
    expect(PORTRAIT_RADAR_VIDEO_HEIGHT_PX).toBe(150)
    for (const mode of ['mobile-portrait sidebar-condensed', 'mobile-portrait sidebar-condensed pwa-standalone is-touch']) {
      document.body.className = mode
      expect(milestoneVideoPlacement(document.body, { left: 4, top: 8, width: 200, height: 100 })).toEqual(condensed)
    }

    const overlay = new VideoOverlay()
    overlay.overlayElement.style.left = '0px'
    overlay.overlayElement.style.top = '0px'
    overlay.overlayElement.style.right = '4px'
    overlay.overlayElement.style.bottom = '8px'
    overlay.overlayElement.style.width = '160px'
    overlay.overlayElement.style.height = '120px'
    overlay.updateVideoPlacement()

    expect(overlay.overlayElement.classList.contains('native-video')).toBe(true)
    for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
      expect(overlay.overlayElement.style[key]).toBe('')
    }
    const css = overlayCss()
    const baseCss = readFileSync(resolve(process.cwd(), 'styles/base.css'), 'utf8')
    expectPortraitRadarRule(css, 'sidebar-condensed', PORTRAIT_CONDENSED_RADAR_BOTTOM)
    expectPortraitRadarRule(css, 'sidebar-collapsed', PORTRAIT_COLLAPSED_RADAR_BOTTOM)
    expect(baseCss).toMatch(/body\.mobile-portrait\.sidebar-condensed #mobileMinimapOverlay\.visible\s*\{[^}]*width:\s*250px;[^}]*height:\s*150px;[^}]*right:\s*var\(--safe-area-right\)/)
    expect(baseCss).toContain(PORTRAIT_CONDENSED_RADAR_BOTTOM)
    expect(baseCss).toContain(PORTRAIT_COLLAPSED_RADAR_BOTTOM)
    expect(css).toMatch(/body\.mobile-portrait #video-overlay\.native-video\.show\s*\{[^}]*pointer-events:\s*auto;/)
    expect(css).not.toMatch(/width:\s*50vw/)
    expect(css).not.toMatch(/aspect-ratio:\s*160\s*\/\s*120/)
    expect(css).not.toMatch(/body\.pwa-standalone\.mobile-portrait\.sidebar-condensed #video-overlay/)

    document.body.className = 'mobile-landscape'
    const minimap = document.createElement('div')
    minimap.id = 'minimap'
    minimap.getBoundingClientRect = () => ({ left: 12, top: 24, width: 240, height: 160 })
    document.body.appendChild(minimap)
    overlay.updateVideoPlacement()
    expect(overlay.overlayElement.style.left).toBe('12px')
    expect(overlay.overlayElement.style.top).toBe('24px')
    expect(overlay.overlayElement.style.width).toBe('240px')
    expect(overlay.overlayElement.style.height).toBe('160px')
    expect(overlay.overlayElement.style.bottom).toBe('')
    overlay.destroy()
    minimap.remove()
  })

  it.each(['', 'mobile-portrait', 'mobile-landscape'])('[U02800] uses the minimap bounds in expanded layout %s', mode => {
    document.body.className = mode
    const rect = { left: 12, top: 24, width: 240, height: 160 }
    expect(milestoneVideoPlacement(document.body, rect)).toEqual(rect)
    expect(milestoneVideoPlacement(document.body, { width: 0, height: 0 })).toBeNull()
  })

  it('[U02801] configures inline muted autoplay with buffered preload', () => {
    const video = document.createElement('video')
    configureMilestoneVideo(video)
    for (const attribute of ['muted', 'autoplay', 'playsinline', 'webkit-playsinline']) {
      expect(video.hasAttribute(attribute)).toBe(true)
    }
    expect(video.muted).toBe(true)
    expect(video.preload).toBe('auto')
  })

  it('[U02802] reveals only the active playing video and ignores late playing events during fade-out', () => {
    vi.useFakeTimers()
    const overlay = new VideoOverlay()
    const video = overlay.overlayElement.querySelector('video')
    overlay.currentVideo = video
    overlay.isPlaying = true
    expect(overlay.overlayElement.classList.contains('show')).toBe(false)
    overlay.revealPlayingVideo(document.createElement('video'))
    expect(overlay.presentationReady).toBe(false)
    overlay.revealPlayingVideo(video)
    expect(overlay.overlayElement.classList.contains('show')).toBe(true)
    overlay.nativePresentation = true
    overlay.stopCurrentVideo()
    overlay.revealPlayingVideo(video)
    expect(overlay.overlayElement.classList.contains('show')).toBe(false)
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    overlay.destroy()
  })

  it('[U02803] keeps the playing element until the opacity fade finishes', () => {
    vi.useFakeTimers()
    const overlay = new VideoOverlay()
    const video = overlay.overlayElement.querySelector('video')
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    overlay.currentVideo = video
    overlay.isPlaying = true
    overlay.nativePresentation = true
    overlay.presentationReady = true
    overlay.overlayElement.classList.add('native-video', 'show')
    overlay.stopCurrentVideo()
    expect(overlay.overlayElement.classList.contains('show')).toBe(false)
    expect(overlay.currentVideo).toBe(video)
    expect(video.pause).not.toHaveBeenCalled()
    overlay.stopCurrentVideo()
    vi.advanceTimersByTime(399)
    expect(overlay.currentVideo).toBe(video)
    vi.advanceTimersByTime(1)
    expect(overlay.currentVideo).toBeNull()
    expect(video.pause).toHaveBeenCalledOnce()
    overlay.destroy()
  })

  it('[U05488] closes a playing portrait milestone video when the clip is tapped', () => {
    vi.useFakeTimers()
    document.body.className = 'mobile-portrait sidebar-condensed'
    const overlay = new VideoOverlay()
    const video = overlay.overlayElement.querySelector('video')
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    overlay.currentVideo = video
    overlay.isPlaying = true
    overlay.nativePresentation = true
    overlay.presentationReady = true
    overlay.overlayElement.classList.add('native-video', 'show')
    overlay.overlayElement.style.pointerEvents = 'none'
    overlay.revealPlayingVideo(video)
    expect(overlay.overlayElement.style.pointerEvents).toBe('')

    video.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'touch' }))
    expect(overlay.overlayElement.classList.contains('show')).toBe(false)
    expect(overlay.currentVideo).toBe(video)
    vi.advanceTimersByTime(400)
    expect(overlay.currentVideo).toBeNull()
    overlay.destroy()
  })

  it('[U05489] ignores taps on a playing milestone video outside portrait', () => {
    vi.useFakeTimers()
    document.body.className = 'mobile-landscape'
    const overlay = new VideoOverlay()
    const video = overlay.overlayElement.querySelector('video')
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    overlay.currentVideo = video
    overlay.isPlaying = true
    overlay.nativePresentation = true
    overlay.presentationReady = true
    overlay.overlayElement.classList.add('native-video', 'show')
    video.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }))
    expect(overlay.overlayElement.classList.contains('show')).toBe(true)
    expect(overlay.currentVideo).toBe(video)
    overlay.destroy()
  })

  it('[U07151] applies and removes the signal-acquired glitch on show and close', () => {
    vi.useFakeTimers()
    const overlay = new VideoOverlay()
    const video = overlay.overlayElement.querySelector('video')
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    overlay.currentVideo = video
    overlay.isPlaying = true
    overlay.nativePresentation = true
    overlay.overlayElement.classList.add('native-video')
    const css = overlayCss()
    expect(css).toMatch(/@keyframes milestone-signal-picture/)
    expect(css).toMatch(new RegExp(`animation:[^;]*${MILESTONE_SIGNAL_ACQUIRE_MS}ms`))
    expect(MILESTONE_SIGNAL_CHIRP).toBe('uiToggleOn')
    expect(MILESTONE_SIGNAL_CHIRP_VOLUME).toBeLessThanOrEqual(0.3)
    expect(milestoneSignalMotionEnabled()).toBe(true)

    overlay.revealPlayingVideo(video)
    expect(overlay.overlayElement.classList.contains('show')).toBe(true)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_ACQUIRE_CLASS)).toBe(true)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_RELEASE_CLASS)).toBe(false)
    vi.advanceTimersByTime(MILESTONE_SIGNAL_ACQUIRE_MS - 1)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_ACQUIRE_CLASS)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_ACQUIRE_CLASS)).toBe(false)
    expect(overlay.overlayElement.classList.contains('show')).toBe(true)

    overlay.stopCurrentVideo()
    expect(overlay.overlayElement.classList.contains('show')).toBe(false)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_ACQUIRE_CLASS)).toBe(false)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_RELEASE_CLASS)).toBe(true)
    vi.advanceTimersByTime(MILESTONE_PRESENTATION_FADE_MS - 1)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_RELEASE_CLASS)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_RELEASE_CLASS)).toBe(false)
    expect(overlay.currentVideo).toBeNull()
    overlay.destroy()
  })

  it('[U07152] uses a plain fade when reduced motion is requested', () => {
    vi.useFakeTimers()
    const previous = window.matchMedia
    window.matchMedia = (query) => ({
      matches: String(query).includes('prefers-reduced-motion'),
      media: String(query),
      addEventListener() {},
      removeEventListener() {}
    })
    expect(milestoneSignalMotionEnabled()).toBe(false)
    const overlay = new VideoOverlay()
    const video = overlay.overlayElement.querySelector('video')
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    overlay.currentVideo = video
    overlay.isPlaying = true
    overlay.nativePresentation = true
    overlay.presentationReady = true
    overlay.overlayElement.classList.add('native-video')
    overlay.revealPlayingVideo(video)
    expect(overlay.overlayElement.classList.contains('show')).toBe(true)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_ACQUIRE_CLASS)).toBe(false)
    overlay.stopCurrentVideo()
    expect(overlay.overlayElement.classList.contains('show')).toBe(false)
    expect(overlay.overlayElement.classList.contains(MILESTONE_SIGNAL_RELEASE_CLASS)).toBe(false)
    vi.advanceTimersByTime(MILESTONE_PRESENTATION_FADE_MS)
    expect(overlay.currentVideo).toBeNull()
    overlay.destroy()
    if (previous) window.matchMedia = previous
    else delete window.matchMedia
  })
})
