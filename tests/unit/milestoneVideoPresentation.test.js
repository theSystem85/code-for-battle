import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  configureMilestoneVideo,
  milestoneVideoPlacement,
  PORTRAIT_COMPACT_VIDEO_SIZE,
  PORTRAIT_CONDENSED_VIDEO_TOP_GAP_PX
} from '../../src/ui/milestoneVideoPresentation.js'
import { VideoOverlay } from '../../src/ui/videoOverlay.js'

afterEach(() => {
  document.body.className = ''
  vi.useRealTimers()
})

describe('milestone video presentation', () => {
  it('[U02799] anchors collapsed portrait video at the screen corner', () => {
    document.body.className = 'mobile-portrait sidebar-collapsed'
    expect(milestoneVideoPlacement(document.body, null)).toEqual({
      left: 0,
      top: 0,
      width: PORTRAIT_COMPACT_VIDEO_SIZE.width,
      height: PORTRAIT_COMPACT_VIDEO_SIZE.height
    })
  })

  it('[U05474] centers condensed portrait video with CSS safe-area clearance', () => {
    const condensed = {
      mode: 'portrait-condensed',
      span: 'viewport-width',
      width: PORTRAIT_COMPACT_VIDEO_SIZE.width,
      height: PORTRAIT_COMPACT_VIDEO_SIZE.height,
      topGap: PORTRAIT_CONDENSED_VIDEO_TOP_GAP_PX
    }
    for (const mode of ['mobile-portrait sidebar-condensed', 'mobile-portrait sidebar-condensed pwa-standalone is-touch']) {
      document.body.className = mode
      expect(milestoneVideoPlacement(document.body, { left: 4, top: 8, width: 200, height: 100 })).toEqual(condensed)
    }

    const overlay = new VideoOverlay()
    overlay.overlayElement.style.left = '0px'
    overlay.overlayElement.style.top = '0px'
    overlay.overlayElement.style.width = '160px'
    overlay.overlayElement.style.height = '120px'
    overlay.updateVideoPlacement()

    expect(overlay.overlayElement.classList.contains('native-video')).toBe(true)
    for (const key of ['left', 'top', 'right', 'width', 'height']) {
      expect(overlay.overlayElement.style[key]).toBe('')
    }
    const css = [...document.head.querySelectorAll('style')].map(node => node.textContent).join('\n')
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*top:\s*calc\(12px \+ max\(var\(--safe-area-top, 0px\), env\(safe-area-inset-top, 0px\)\)\)/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*left:\s*0;/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*right:\s*0;/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*width:\s*100%;/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*height:\s*auto;/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*aspect-ratio:\s*160\s*\/\s*120;/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*margin-left:\s*0;/)
    expect(css).toMatch(/body\.mobile-portrait\.sidebar-condensed #video-overlay\.native-video\s*\{[^}]*margin-right:\s*0;/)
    expect(css).toMatch(/body\.mobile-portrait #video-overlay\.native-video\.show\s*\{[^}]*pointer-events:\s*auto;/)
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
})
