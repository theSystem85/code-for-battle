import { describe, expect, it, vi, afterEach } from 'vitest'
import { configureMilestoneVideo, milestoneVideoPlacement } from '../../src/ui/milestoneVideoPresentation.js'
import { VideoOverlay } from '../../src/ui/videoOverlay.js'

afterEach(() => {
  document.body.className = ''
  vi.useRealTimers()
})

describe('milestone video presentation', () => {
  it.each(['sidebar-condensed', 'sidebar-collapsed'])('anchors compact portrait video at the screen corner for %s', mode => {
    document.body.className = `mobile-portrait ${mode}`
    expect(milestoneVideoPlacement(document.body, null)).toEqual({ left: 0, top: 0, width: 160, height: 120 })
  })

  it.each(['', 'mobile-portrait', 'mobile-landscape'])('uses the minimap bounds in expanded layout %s', mode => {
    document.body.className = mode
    const rect = { left: 12, top: 24, width: 240, height: 160 }
    expect(milestoneVideoPlacement(document.body, rect)).toEqual(rect)
    expect(milestoneVideoPlacement(document.body, { width: 0, height: 0 })).toBeNull()
  })

  it('configures inline muted autoplay with buffered preload', () => {
    const video = document.createElement('video')
    configureMilestoneVideo(video)
    for (const attribute of ['muted', 'autoplay', 'playsinline', 'webkit-playsinline']) {
      expect(video.hasAttribute(attribute)).toBe(true)
    }
    expect(video.muted).toBe(true)
    expect(video.preload).toBe('auto')
  })

  it('reveals only the active playing video and ignores late playing events during fade-out', () => {
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

  it('keeps the playing element until the opacity fade finishes', () => {
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
})
