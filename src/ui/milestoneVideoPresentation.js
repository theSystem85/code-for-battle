export const MILESTONE_PRESENTATION_FADE_MS = 400

export function milestoneVideoPlacement(body, minimapRect) {
  const classes = body.classList
  if (classes.contains('mobile-portrait') &&
    (classes.contains('sidebar-condensed') || classes.contains('sidebar-collapsed'))) {
    return { left: 0, top: 0, width: 160, height: 120 }
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
