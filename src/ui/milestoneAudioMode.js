// Milestone clips play the narrator MP3 and the video's own soundtrack together.
// The MP3 is the voice line. The embedded AAC, when the file has one, is the
// clip's sound and stays under that voice. Master mute still silences both.

export const MILESTONE_NARRATION_GAIN = 0.28
// The embedded AAC is mastered hotter than the voice MP3. This bed keeps the
// clip sound audible under the narration at master volume 1.
export const MILESTONE_VIDEO_BED_GAIN = 0.1

function clampUnitInterval(value) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  if (number >= 1) return 1
  return number
}

/**
 * True when the mp4 is the only audio source.
 * A usable MP3 is extra narration. It does not mute the picture.
 */
export function milestoneClipUsesEmbeddedAudio(hasUsableSeparateMp3) {
  return hasUsableSeparateMp3 !== true
}

export function resolveMilestoneAudioMode(hasUsableSeparateMp3) {
  const onlyEmbedded = milestoneClipUsesEmbeddedAudio(hasUsableSeparateMp3)
  return {
    useSeparateAudio: !onlyEmbedded,
    useEmbeddedAudio: true,
    muteVideo: false
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
export function resolveMilestonePlaybackVolume(masterVolume, sfxVolume, voiceVolume, muted, fade, gain = MILESTONE_NARRATION_GAIN) {
  if (muted === true) return 0
  const level = typeof gain === 'number' && Number.isFinite(gain) && gain > 0 ? gain : 0
  return level
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
 * Play a milestone video with its own soundtrack audible.
 * A companion MP3 does not mute the element. If the browser rejects unmuted
 * play(), the picture starts muted and the caller retries on the next gesture.
 * forceMute is the master/headless mute and stays silent.
 */
export async function playMilestoneVideoWithAudioPolicy(video, hasUsableSeparateMp3, volume, forceMute, playImpl) {
  const mode = resolveMilestoneAudioMode(hasUsableSeparateMp3)
  const muteVideo = forceMute === true
  const play = playImpl || (element => element.play())
  applyMilestoneVideoAudioState(video, muteVideo, muteVideo ? 0 : volume)
  try {
    await play(video)
    return {
      useSeparateAudio: mode.useSeparateAudio,
      useEmbeddedAudio: true,
      blockedByAutoplay: false,
      playingMuted: muteVideo
    }
  } catch (error) {
    if (muteVideo || error?.name !== 'NotAllowedError') throw error
    applyMilestoneVideoAudioState(video, true, 0)
    await play(video)
    return {
      useSeparateAudio: mode.useSeparateAudio,
      useEmbeddedAudio: true,
      blockedByAutoplay: true,
      playingMuted: true
    }
  }
}
