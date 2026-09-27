import { describe, expect, it, vi } from 'vitest'
import { getMasterVolume, setMasterVolume } from '../../src/sound.js'
import {
  MILESTONE_NARRATION_GAIN,
  applyMilestoneVideoAudioState,
  MILESTONE_VIDEO_BED_GAIN,
  milestoneClipUsesEmbeddedAudio,
  playMilestoneVideoWithAudioPolicy,
  resolveMilestoneAudioMode,
  resolveMilestonePlaybackVolume
} from '../../src/ui/milestoneAudioMode.js'
import { videoOverlay } from '../../src/ui/videoOverlay.js'

function fakeVideo(play) {
  const attributes = new Set(['muted'])
  return {
    muted: true,
    defaultMuted: true,
    volume: 1,
    setAttribute(name) { attributes.add(name) },
    removeAttribute(name) { attributes.delete(name) },
    hasAttribute(name) { return attributes.has(name) },
    play: play || vi.fn(() => Promise.resolve())
  }
}

describe('milestone embedded vs separate audio', () => {
  it('plays embedded audio when there is no usable separate MP3', () => {
    expect(milestoneClipUsesEmbeddedAudio(false)).toBe(true)
    expect(milestoneClipUsesEmbeddedAudio(undefined)).toBe(true)
    expect(milestoneClipUsesEmbeddedAudio(null)).toBe(true)

    const missing = resolveMilestoneAudioMode(false)
    expect(missing).toEqual({
      useSeparateAudio: false,
      useEmbeddedAudio: true,
      muteVideo: false
    })

    const failed = resolveMilestoneAudioMode(undefined)
    expect(failed.useEmbeddedAudio).toBe(true)
    expect(failed.muteVideo).toBe(false)
  })

  it('keeps the video audible when a separate MP3 is usable', () => {
    expect(milestoneClipUsesEmbeddedAudio(true)).toBe(false)
    expect(resolveMilestoneAudioMode(true)).toEqual({
      useSeparateAudio: true,
      useEmbeddedAudio: true,
      muteVideo: false
    })
  })

  it('scales embedded and companion volume by master, sfx, voice, mute, and fade', () => {
    expect(resolveMilestonePlaybackVolume(1, 1, 1, false, 1)).toBeCloseTo(MILESTONE_NARRATION_GAIN)
    expect(resolveMilestonePlaybackVolume(0.5, 1, 1, false, 1)).toBeCloseTo(MILESTONE_NARRATION_GAIN * 0.5)
    expect(resolveMilestonePlaybackVolume(1, 0.5, 0.5, false, 1)).toBeCloseTo(MILESTONE_NARRATION_GAIN * 0.25)
    expect(resolveMilestonePlaybackVolume(1, 1, 1, false, 0.5)).toBeCloseTo(MILESTONE_NARRATION_GAIN * 0.5)
    expect(resolveMilestonePlaybackVolume(0, 1, 1, false, 1)).toBe(0)
    expect(resolveMilestonePlaybackVolume(1, 0, 1, false, 1)).toBe(0)
    expect(resolveMilestonePlaybackVolume(1, 1, 0, false, 1)).toBe(0)
    expect(resolveMilestonePlaybackVolume(1, 1, 1, true, 1)).toBe(0)
    expect(resolveMilestonePlaybackVolume(2, 2, 2, false, 2)).toBeCloseTo(MILESTONE_NARRATION_GAIN)
    expect(resolveMilestonePlaybackVolume(Number.NaN, 1, 1, false, 1)).toBe(0)
    expect(resolveMilestonePlaybackVolume(1, 1, 1, false, 1, MILESTONE_VIDEO_BED_GAIN)).toBeCloseTo(MILESTONE_VIDEO_BED_GAIN)
    expect(resolveMilestonePlaybackVolume(0.5, 0.5, 1, false, 1, MILESTONE_VIDEO_BED_GAIN)).toBeCloseTo(MILESTONE_VIDEO_BED_GAIN * 0.25)
  })

  it('unmutes when asked and mutes when the caller forces silence', () => {
    const embedded = fakeVideo()
    applyMilestoneVideoAudioState(embedded, false, 0.28)
    expect(embedded.muted).toBe(false)
    expect(embedded.defaultMuted).toBe(false)
    expect(embedded.hasAttribute('muted')).toBe(false)
    expect(embedded.volume).toBeCloseTo(0.28)

    const companion = fakeVideo()
    applyMilestoneVideoAudioState(companion, true, 0.28)
    expect(companion.muted).toBe(true)
    expect(companion.defaultMuted).toBe(true)
    expect(companion.hasAttribute('muted')).toBe(true)
    expect(companion.volume).toBe(0)
  })

  it('plays embedded audio unmuted, and falls back to muted playback when autoplay blocks it', async() => {
    const allowed = fakeVideo()
    const allowedResult = await playMilestoneVideoWithAudioPolicy(allowed, false, 0.2, false)
    expect(allowedResult).toMatchObject({
      useEmbeddedAudio: true,
      useSeparateAudio: false,
      blockedByAutoplay: false,
      playingMuted: false
    })
    expect(allowed.muted).toBe(false)
    expect(allowed.volume).toBeCloseTo(0.2)
    expect(allowed.play).toHaveBeenCalledTimes(1)

    const blocked = fakeVideo(vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('play blocked'), { name: 'NotAllowedError' }))
      .mockResolvedValueOnce(undefined))
    const blockedResult = await playMilestoneVideoWithAudioPolicy(blocked, false, 0.2, false)
    expect(blockedResult.blockedByAutoplay).toBe(true)
    expect(blockedResult.playingMuted).toBe(true)
    expect(blocked.muted).toBe(true)
    expect(blocked.volume).toBe(0)
    expect(blocked.play).toHaveBeenCalledTimes(2)
  })

  it('plays the video unmuted at bed level while a companion MP3 is in use', async() => {
    const video = fakeVideo()
    const result = await playMilestoneVideoWithAudioPolicy(video, true, MILESTONE_VIDEO_BED_GAIN, false)
    expect(result).toMatchObject({
      useSeparateAudio: true,
      useEmbeddedAudio: true,
      blockedByAutoplay: false,
      playingMuted: false
    })
    expect(video.muted).toBe(false)
    expect(video.defaultMuted).toBe(false)
    expect(video.hasAttribute('muted')).toBe(false)
    expect(video.volume).toBeGreaterThan(0)
    expect(video.volume).toBeCloseTo(MILESTONE_VIDEO_BED_GAIN)
  })

  it('falls back to a muted picture when unmuted playback is blocked for a companion clip', async() => {
    const video = fakeVideo(vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('play blocked'), { name: 'NotAllowedError' }))
      .mockResolvedValueOnce(undefined))
    const result = await playMilestoneVideoWithAudioPolicy(video, true, MILESTONE_VIDEO_BED_GAIN, false)
    expect(result.useSeparateAudio).toBe(true)
    expect(result.blockedByAutoplay).toBe(true)
    expect(result.playingMuted).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.volume).toBe(0)
    expect(video.play).toHaveBeenCalledTimes(2)
  })

  it('keeps a muted game silent without treating a zero fade as a missing MP3', async() => {
    const video = fakeVideo()
    const result = await playMilestoneVideoWithAudioPolicy(video, false, 0, true)
    expect(result.useEmbeddedAudio).toBe(true)
    expect(result.playingMuted).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.volume).toBe(0)
  })

  it('fades milestone audio with the radar and stops it when the clip is interrupted', () => {
    const previous = getMasterVolume()
    setMasterVolume(1)
    const video = {
      muted: false,
      volume: 1,
      currentTime: 1,
      pause() { this.paused = true },
      removeAttribute() {},
      load() {},
      parentNode: null
    }
    const audio = {
      volume: 1,
      currentTime: 1,
      pause() { this.paused = true }
    }
    videoOverlay.usesEmbeddedAudio = true
    videoOverlay.currentVideo = video
    videoOverlay.currentAudio = null
    videoOverlay.milestoneAudioMuted = false
    videoOverlay.milestoneMasterVolume = 1
    videoOverlay.embeddedUnmutePending = false
    videoOverlay.isPlaying = true

    videoOverlay.applyMilestoneAudioFade(0.5)
    expect(video.volume).toBeCloseTo(MILESTONE_NARRATION_GAIN * 0.5)

    videoOverlay.milestoneAudioMuted = true
    videoOverlay.applyMilestoneAudioFade(1)
    expect(video.volume).toBe(0)

    videoOverlay.milestoneAudioMuted = false
    videoOverlay.embeddedUnmutePending = true
    video.volume = 0.4
    videoOverlay.applyMilestoneAudioFade(1)
    expect(video.volume).toBe(0.4)

    videoOverlay.embeddedUnmutePending = false
    videoOverlay.usesEmbeddedAudio = false
    videoOverlay.currentAudio = audio
    video.muted = false
    videoOverlay.applyMilestoneAudioFade(1)
    expect(audio.volume).toBeCloseTo(MILESTONE_NARRATION_GAIN)
    expect(audio.volume).toBeGreaterThan(0)
    expect(video.muted).toBe(false)
    expect(video.volume).toBeGreaterThan(0)
    expect(video.volume).toBeCloseTo(MILESTONE_VIDEO_BED_GAIN)
    expect(video.volume).toBeLessThan(audio.volume)

    videoOverlay.audioFadeFrame = 7
    videoOverlay.stopCurrentVideo()
    expect(videoOverlay.isVideoPlaying()).toBe(false)
    expect(videoOverlay.currentAudio).toBeNull()
    expect(videoOverlay.currentVideo).toBeNull()
    expect(audio.paused).toBe(true)
    expect(audio.volume).toBe(0)
    expect(video.paused).toBe(true)
    expect(video.volume).toBe(0)

    setMasterVolume(previous)
  })
})
