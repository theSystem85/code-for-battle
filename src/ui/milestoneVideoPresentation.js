export const MILESTONE_PRESENTATION_FADE_MS = 400

/**
 * Signal-acquired glitch. Short enough to read as a lock, long enough for a
 * few channel splits and slice steps. The close plays the same motion backward
 * inside the opacity fade.
 */
export const MILESTONE_SIGNAL_ACQUIRE_MS = 400
export const MILESTONE_SIGNAL_RELEASE_MS = 360
export const MILESTONE_SIGNAL_ACQUIRE_CLASS = 'signal-acquire'
export const MILESTONE_SIGNAL_RELEASE_CLASS = 'signal-release'

/**
 * Registered UI chirp for the lock. uiToggleOn is a short toggle tick.
 * Volume stays low so it sits under the clip's own soundtrack.
 */
export const MILESTONE_SIGNAL_CHIRP = 'uiToggleOn'
export const MILESTONE_SIGNAL_CHIRP_VOLUME = 0.22

/**
 * Portrait radar box. Copies `#mobileMinimapOverlay.visible` in styles/base.css:
 * 250×150 is 5:3, the same shape as the 960×576 milestone masters.
 * Half the viewport (50vw, 195px on a 390px phone) does not match that rect,
 * so the clip uses the radar size instead.
 */
export const PORTRAIT_RADAR_VIDEO_WIDTH_PX = 250
export const PORTRAIT_RADAR_VIDEO_HEIGHT_PX = 150
export const PORTRAIT_RADAR_VIDEO_ASPECT = '5 / 3'
export const PORTRAIT_RADAR_RIGHT = 'var(--safe-area-right)'
export const PORTRAIT_CONDENSED_VIDEO_TOP =
  'calc(12px + max(var(--safe-area-top, 0px), env(safe-area-inset-top, 0px)))'
export const PORTRAIT_VIDEO_SLIDE_MS = 400
export const PORTRAIT_COLLAPSED_RADAR_BOTTOM =
  'calc(var(--safe-area-bottom) + var(--mobile-action-size) + 24px)'

const PORTRAIT_MINIMAP_PLACEMENTS = Object.freeze({
  condensed: Object.freeze({
    mode: 'portrait-minimap',
    layout: 'condensed',
    anchor: 'top-left',
    width: PORTRAIT_RADAR_VIDEO_WIDTH_PX,
    height: PORTRAIT_RADAR_VIDEO_HEIGHT_PX,
    top: PORTRAIT_CONDENSED_VIDEO_TOP,
    left: 'var(--safe-area-left, 0px)'
  }),
  collapsed: Object.freeze({
    mode: 'portrait-minimap',
    layout: 'collapsed',
    anchor: 'bottom-right',
    width: PORTRAIT_RADAR_VIDEO_WIDTH_PX,
    height: PORTRAIT_RADAR_VIDEO_HEIGHT_PX,
    right: PORTRAIT_RADAR_RIGHT,
    bottom: PORTRAIT_COLLAPSED_RADAR_BOTTOM
  })
})

export function portraitMinimapPlacement(layout) {
  return PORTRAIT_MINIMAP_PLACEMENTS[layout] || null
}

/**
 * CSS for one portrait layout. Position stays in the stylesheet so a safe-area
 * change moves the clip without another placement pass. Inline pixels would
 * freeze the old edge.
 */
export function portraitMinimapOverlayCss(layout) {
  const placement = portraitMinimapPlacement(layout)
  if (!placement) return ''
  const sidebar = layout === 'collapsed' ? 'sidebar-collapsed' : 'sidebar-condensed'
  return `
      body.mobile-portrait.${sidebar} #video-overlay.native-video {
        top: ${placement.top || 'auto'};
        left: ${placement.left || 'auto'};
        right: ${placement.right || 'auto'};
        bottom: ${placement.bottom || 'auto'};
        width: ${placement.width}px;
        height: ${placement.height}px;
        aspect-ratio: ${PORTRAIT_RADAR_VIDEO_ASPECT};
        margin: 0;
        z-index: calc(var(--z-hud-float) + 2);
      }`
}

export function milestoneVideoPlacement(body, minimapRect) {
  const classes = body.classList
  if (classes.contains('mobile-portrait') && classes.contains('sidebar-condensed')) {
    return portraitMinimapPlacement('condensed')
  }
  if (classes.contains('mobile-portrait') && classes.contains('sidebar-collapsed')) {
    return portraitMinimapPlacement('collapsed')
  }
  if (!minimapRect || minimapRect.width <= 0 || minimapRect.height <= 0) return null
  return { left: minimapRect.left, top: minimapRect.top, width: minimapRect.width, height: minimapRect.height }
}

export function milestoneSignalMotionEnabled(win = typeof window === 'undefined' ? null : window) {
  if (!win || typeof win.matchMedia !== 'function') return true
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches !== true
  } catch {
    return true
  }
}

export function configureMilestoneVideo(video) {
  video.defaultMuted = true
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.setAttribute('autoplay', '')
}
