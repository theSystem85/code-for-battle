export const MILESTONE_PRESENTATION_FADE_MS = 400

/** Compact clip used when the portrait sidebar is not showing the minimap. */
export const PORTRAIT_COMPACT_VIDEO_SIZE = Object.freeze({ width: 160, height: 120 })

/**
 * Gap below the iOS protected top region (Dynamic Island, notch, status bar).
 * The safe-area inset clears the protected area; this keeps the clip from
 * sitting flush against that edge.
 */
export const PORTRAIT_CONDENSED_VIDEO_TOP_GAP_PX = 12

export function milestoneVideoPlacement(body, minimapRect) {
  const classes = body.classList
  if (classes.contains('mobile-portrait') && classes.contains('sidebar-condensed')) {
    return {
      mode: 'portrait-condensed',
      width: PORTRAIT_COMPACT_VIDEO_SIZE.width,
      height: PORTRAIT_COMPACT_VIDEO_SIZE.height,
      topGap: PORTRAIT_CONDENSED_VIDEO_TOP_GAP_PX
    }
  }
  if (classes.contains('mobile-portrait') && classes.contains('sidebar-collapsed')) {
    return {
      left: 0,
      top: 0,
      width: PORTRAIT_COMPACT_VIDEO_SIZE.width,
      height: PORTRAIT_COMPACT_VIDEO_SIZE.height
    }
  }
  if (!minimapRect || minimapRect.width <= 0 || minimapRect.height <= 0) return null
  return { left: minimapRect.left, top: minimapRect.top, width: minimapRect.width, height: minimapRect.height }
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
