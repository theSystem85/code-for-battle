// Hidden preload cache for milestone mp4/mp3 pairs.
// Creating these elements must not start playback or mark a video as current.

export const MILESTONE_VIDEO_FADE_MS = 220

const UNIT_VIDEO_MILESTONES = Object.freeze({
  tank: Object.freeze(['firstTank', 'first_tank']),
  tank_v1: Object.freeze(['firstTank', 'first_tank']),
  mineLayer: Object.freeze(['firstMineLayer', 'first_mine_layer']),
  mineSweeper: Object.freeze(['firstMineSweeper', 'first_mine_sweeper']),
  rocketTank: Object.freeze(['firstRocketTankBuilt', 'first_rocket_tank']),
  howitzer: Object.freeze(['firstHowitzer', 'first_artillery'])
})

const BUILDING_VIDEO_MILESTONES = Object.freeze({
  oreRefinery: Object.freeze(['firstRefinery', 'tank_over_crystals']),
  teslaCoil: Object.freeze(['firstTeslaCoil', 'tesla_coil_hits_tank']),
  airstrip: Object.freeze(['firstAirstrip', 'air_strip'])
})

const preloadCache = new Map()
let achievedCheck = null
let claimNarration = null
let mediaPreloadSupported = null

function browserCanPreloadMilestoneMedia() {
  if (mediaPreloadSupported !== null) return mediaPreloadSupported
  mediaPreloadSupported = false
  if (typeof document === 'undefined') return false
  try {
    const probe = document.createElement('video')
    mediaPreloadSupported = typeof probe.canPlayType === 'function' && probe.canPlayType('video/mp4') !== ''
  } catch {
    mediaPreloadSupported = false
  }
  return mediaPreloadSupported
}

export function setMilestoneAchievedCheck(check) {
  achievedCheck = typeof check === 'function' ? check : null
}

export function setFirstProductionNarrationClaim(claim) {
  claimNarration = typeof claim === 'function' ? claim : null
}

export function firstProductionNarrationMilestoneId(unitType) {
  const match = UNIT_VIDEO_MILESTONES[unitType]
  return match ? match[0] : null
}

/**
 * When the first "running off the production line" narrator plays, the caller
 * should skip the unit-ready sting. Later units of that type return false.
 * Unregistered callers (tests that do not load the milestone system) do not skip.
 */
export function claimFirstProductionNarration(unitType) {
  if (typeof claimNarration !== 'function') return false
  return claimNarration(unitType) === true
}

export function isMilestoneMediaPreloaded(baseFilename) {
  return preloadCache.has(baseFilename)
}

export function takePreloadedMilestoneMedia(baseFilename) {
  const entry = preloadCache.get(baseFilename) || null
  if (entry) preloadCache.delete(baseFilename)
  return entry
}

export function clearMilestoneMediaPreload() {
  preloadCache.forEach(entry => {
    const video = entry?.video
    if (video) {
      try {
        video.pause()
        video.removeAttribute('src')
        if (video.parentNode) video.parentNode.removeChild(video)
      } catch {
        // Ignore cleanup failures for detached preload elements.
      }
    }
  })
  preloadCache.clear()
}

export function preloadMilestoneMedia(baseFilename) {
  if (!baseFilename || preloadCache.has(baseFilename)) return
  const entry = {
    baseFilename,
    video: null,
    audio: null,
    audioFailed: false
  }
  if (browserCanPreloadMilestoneMedia()) {
    try {
      const video = document.createElement('video')
      video.muted = true
      video.defaultMuted = true
      video.playsInline = true
      video.preload = 'auto'
      video.setAttribute('playsinline', '')
      video.setAttribute('aria-hidden', 'true')
      video.dataset.milestonePreload = baseFilename
      video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'
      const audio = document.createElement('audio')
      audio.preload = 'auto'
      audio.addEventListener('error', () => {
        entry.audioFailed = true
      })
      video.src = `video/${baseFilename}.mp4`
      audio.src = `video/${baseFilename}.mp3`
      if (document.body) document.body.appendChild(video)
      video.load()
      audio.load()
      entry.video = video
      entry.audio = audio
    } catch {
      entry.video = null
      entry.audio = null
    }
  }
  preloadCache.set(baseFilename, entry)
}

/**
 * Preload the milestone clip for a unit or building whose production just started.
 * No-ops when that milestone is already achieved or has no video.
 * Does not show or play the clip.
 */
export function preloadMilestoneForProduction(type, isBuilding) {
  const table = isBuilding ? BUILDING_VIDEO_MILESTONES : UNIT_VIDEO_MILESTONES
  const match = table[type]
  if (!match) return null
  const milestoneId = match[0]
  const baseFilename = match[1]
  if (achievedCheck && achievedCheck(milestoneId)) return null
  preloadMilestoneMedia(baseFilename)
  return baseFilename
}

/**
 * Opacity for a milestone video painted on the minimap.
 * Fades in at the start and out at the end. No per-frame allocations.
 * A playing clip with no start timestamp stays fully opaque so callers that
 * only know "video is playing" keep the previous cover behavior.
 */
export function computeMilestoneVideoOpacity(isPlaying, playbackStartedAt, now, duration, currentTime, fadeMs = MILESTONE_VIDEO_FADE_MS) {
  if (!isPlaying) return 0
  if (!playbackStartedAt) return 1
  const elapsed = now - playbackStartedAt
  const fadeIn = elapsed >= fadeMs ? 1 : (elapsed <= 0 ? 0 : elapsed / fadeMs)
  let fadeOut = 1
  if (Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime)) {
    const remainingMs = (duration - currentTime) * 1000
    if (remainingMs < fadeMs) {
      fadeOut = remainingMs <= 0 ? 0 : remainingMs / fadeMs
    }
  }
  return fadeIn * fadeOut
}
