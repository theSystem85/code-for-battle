// Decides whether a milestone clip plays a separate MP3 or the audio
// embedded in the video file, and how loud that track is.

export const MILESTONE_NARRATION_GAIN = 0.28

function clampUnitInterval(value) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  if (number >= 1) return 1
  return number
}

/**
 * True when this clip should play the audio track inside the mp4.
 * A usable separate MP3 keeps the video muted so the voice-over is not doubled.
 * Missing, failed, or not-yet-provided companion files use the embedded track.
 */
export function milestoneClipUsesEmbeddedAudio(hasUsableSeparateMp3) {
  return hasUsableSeparateMp3 !== true
}

export function resolveMilestoneAudioMode(hasUsableSeparateMp3) {
  const useEmbeddedAudio = milestoneClipUsesEmbeddedAudio(hasUsableSeparateMp3)
  return {
    useSeparateAudio: !useEmbeddedAudio,
    useEmbeddedAudio,
    muteVideo: !useEmbeddedAudio
  }
}

/**
 * Narration level for a milestone clip.
 * masterVolume is the game's master slider (0 is muted).
 * sfxVolume and voiceVolume scale the same way as the rest of the mix when a
 * caller has those channels; the game's single slider passes 1 for both.
 * fade is the radar opacity fade (0..1). muted forces silence.
 * No objects are allocated so the minimap frame can call this directly.
 */
export function resolveMilestonePlaybackVolume(masterVolume, sfxVolume, voiceVolume, muted, fade) {
  if (muted === true) return 0
  return MILESTONE_NARRATION_GAIN
    * clampUnitInterval(masterVolume)
    * clampUnitInterval(sfxVolume)
    * clampUnitInterval(voiceVolume)
    * clampUnitInterval(fade)
}

/**
 * Mute state is the content attribute and the IDL property. Clearing only
 * `muted` leaves preloaded clips (and the overlay template) silent.
 */
export function applyMilestoneVideoAudioState(video, muteVideo, volume) {
  if (!video) return
  if (muteVideo) {
    video.defaultMuted = true
    video.muted = true
    if (typeof video.setAttribute === 'function') video.setAttribute('muted', '')
    video.volume = 0
    return
  }
  video.defaultMuted = false
  if (typeof video.removeAttribute === 'function') video.removeAttribute('muted')
  video.muted = false
  const level = clampUnitInterval(volume)
  video.volume = level
}

/**
 * Play a milestone video. Embedded clips try unmuted playback so their own
 * track is heard. If the browser rejects that, play muted and report that
 * the caller should retry unmuted on the next user gesture.
 * Companion-MP3 clips stay muted. Their play() rejection is not swallowed.
 */
export async function playMilestoneVideoWithAudioPolicy(video, hasUsableSeparateMp3, volume, forceMute, playImpl) {
  const mode = resolveMilestoneAudioMode(hasUsableSeparateMp3)
  const muteVideo = mode.muteVideo || forceMute === true
  const play = playImpl || (element => element.play())
  applyMilestoneVideoAudioState(video, muteVideo, muteVideo ? 0 : volume)
  try {
    await play(video)
    return {
      useSeparateAudio: mode.useSeparateAudio,
      useEmbeddedAudio: mode.useEmbeddedAudio,
      blockedByAutoplay: false,
      playingMuted: muteVideo
    }
  } catch (error) {
    if (muteVideo || error?.name !== 'NotAllowedError') throw error
    applyMilestoneVideoAudioState(video, true, 0)
    await play(video)
    return {
      useSeparateAudio: false,
      useEmbeddedAudio: true,
      blockedByAutoplay: true,
      playingMuted: true
    }
  }
}
