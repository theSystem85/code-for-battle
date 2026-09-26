// ui/videoOverlay.js
import { getMasterVolume } from '../sound.js'
import { isHeadlessAudioMuted } from '../utils/headlessAudioMute.js'
import {
  computeMilestoneVideoOpacity,
  takePreloadedMilestoneMedia
} from './milestoneMediaCache.js'
import {
  applyMilestoneVideoAudioState,
  playMilestoneVideoWithAudioPolicy,
  resolveMilestonePlaybackVolume
} from './milestoneAudioMode.js'

function waitForMediaEvent(media, eventName, timeoutMs) {
  if (!media) return Promise.reject(new Error('missing media'))
  if (eventName === 'canplay' && media.readyState >= 2) return Promise.resolve()
  if (eventName === 'canplaythrough' && media.readyState >= 4) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Media ${eventName} timeout`))
    }, timeoutMs)
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = (event) => {
      cleanup()
      reject(event)
    }
    const cleanup = () => {
      clearTimeout(timeout)
      media.removeEventListener(eventName, onReady)
      media.removeEventListener('error', onError)
    }
    media.addEventListener(eventName, onReady, { once: true })
    media.addEventListener('error', onError, { once: true })
  })
}

/**
 * Video overlay system for playing milestone videos over the minimap
 * Provides synchronized audio-visual feedback for game achievements
 */
export class VideoOverlay {
  constructor() {
    this.isPlaying = false
    this.currentVideo = null
    this.currentAudio = null
    this.overlayElement = null
    this.videoQueue = []
    this.playbackStartedAt = 0
    this.usesEmbeddedAudio = false
    this.lastAudioFade = 1
    this.milestoneAudioMuted = false
    this.milestoneMasterVolume = 1
    this.embeddedUnmutePending = false
    this.embeddedUnmuteRetry = null
    this.audioFadeFrame = 0
    this.boundAudioFadeStep = () => {
      this.audioFadeFrame = 0
      if (!this.isPlaying) return
      this.applyMilestoneAudioFade(this.getMilestoneVideoOpacity())
      this.audioFadeFrame = requestAnimationFrame(this.boundAudioFadeStep)
    }
    this.createOverlayElement()
  }

  /**
   * Create the video overlay DOM element
   */
  createOverlayElement() {
    this.overlayElement = document.createElement('div')
    this.overlayElement.id = 'video-overlay'
    this.overlayElement.className = 'video-overlay hidden'

    this.overlayElement.innerHTML = `
      <div class="video-container">
        <video class="milestone-video" muted playsinline>
          Your browser does not support the video tag.
        </video>
        <div class="video-controls">
          <div class="milestone-info">
            <h3 class="milestone-title"></h3>
            <p class="milestone-description"></p>
          </div>
          <button class="skip-video-btn">Skip</button>
        </div>
      </div>
    `

    // Add CSS styles
    this.addStyles()

    // Append to body
    document.body.appendChild(this.overlayElement)

    // Set up event listeners
    this.setupEventListeners()
  }

  /**
   * Add CSS styles for the video overlay
   */
  addStyles() {
    const style = document.createElement('style')
    style.textContent = `
      .video-overlay {
        position: fixed;
        top: -1000px;
        left: -1000px;
        width: 240px;
        height: 160px;
        z-index: -1;
        background: rgba(0, 0, 0, 0.95);
        border-radius: 8px;
        transition: none;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
      }

      .video-overlay.hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .video-overlay.show {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .video-container {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: column;
      }

      .milestone-video {
        width: 100%;
        height: 100%;
        object-fit: fill;
        background: #000;
      }

      .video-controls {
        padding: 8px;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-grow: 1;
      }

      .milestone-info {
        flex-grow: 1;
        margin-right: 10px;
      }

      .milestone-title {
        color: #00ff00;
        font-size: 12px;
        margin: 0 0 4px 0;
        font-weight: bold;
        text-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
      }

      .milestone-description {
        color: #ffffff;
        font-size: 10px;
        margin: 0;
        opacity: 0.8;
        line-height: 1.2;
      }

      .skip-video-btn {
        background: rgba(255, 0, 0, 0.8);
        color: white;
        border: 1px solid #ff0000;
        padding: 4px 8px;
        font-size: 10px;
        cursor: pointer;
        border-radius: 3px;
        transition: background 0.2s;
      }

      .skip-video-btn:hover {
        background: rgba(255, 0, 0, 1);
      }



      .video-overlay.priority-high {
        box-shadow: 0 4px 20px rgba(255, 102, 0, 0.5);
      }

      .video-overlay.priority-high .milestone-title {
        color: #ff6600;
        text-shadow: 0 0 4px rgba(255, 102, 0, 0.5);
      }

      .video-overlay.priority-medium {
        box-shadow: 0 4px 20px rgba(255, 255, 0, 0.3);
      }

      .video-overlay.priority-medium .milestone-title {
        color: #ffff00;
        text-shadow: 0 0 4px rgba(255, 255, 0, 0.5);
      }
    `
    document.head.appendChild(style)
  }

  /**
   * Set up event listeners for video controls
   */
  setupEventListeners() {
    const skipBtn = this.overlayElement.querySelector('.skip-video-btn')
    const video = this.overlayElement.querySelector('.milestone-video')
    skipBtn.addEventListener('click', () => {
      this.stopCurrentVideo()
    })

    // Handle video end
    video.addEventListener('ended', () => {
      // Add a small delay to prevent race conditions
      setTimeout(() => {
        if (this.isPlaying) {
          this.stopCurrentVideo()
        }
      }, 100)
    })

    // Handle video errors with better error information
    video.addEventListener('error', (e) => {
      // Only log/handle error if video is currently active and not during cleanup
      if (this.isPlaying && this.currentVideo === video && video.src) {
        window.logger.warn('Video playback error (video may have ended normally):', {
          error: e,
          videoSrc: video.src,
          networkState: video.networkState,
          readyState: video.readyState,
          currentTime: video.currentTime,
          duration: video.duration,
          errorCode: video.error?.code,
          errorMessage: video.error?.message
        })

        // Only stop if we're actually playing and this is a real error
        this.stopCurrentVideo()
      } else {
        // Silently ignore errors during cleanup or when video is not active
        console.debug('Video error during cleanup (ignored):', e.type)
      }
    })
  }

  /**
   * Play a milestone video with synchronized audio
   */
  async playMilestoneVideo(videoFile, audioFile, milestoneInfo = {}) {
    // If already playing, queue the video
    if (this.isPlaying) {
      this.videoQueue.push({ videoFile, audioFile, milestoneInfo })
      return
    }

    try {
      const titleElement = this.overlayElement.querySelector('.milestone-title')
      const descriptionElement = this.overlayElement.querySelector('.milestone-description')
      const baseFilename = String(videoFile || '').replace(/\.mp4$/i, '')
      const preloaded = takePreloadedMilestoneMedia(baseFilename)
      let video = this.overlayElement.querySelector('.milestone-video')
      let usedPreloadedVideo = false

      // Set milestone info
      titleElement.textContent = milestoneInfo.title || 'Milestone Achieved'
      descriptionElement.textContent = milestoneInfo.description || ''

      // Set priority styling
      this.overlayElement.className = `video-overlay priority-${milestoneInfo.priority || 'low'}`

      // Load video with comprehensive error handling
      const tryLoadVideo = async(videoPath) => {
        return new Promise((resolve, reject) => {
          const video = this.overlayElement.querySelector('.milestone-video')

          // Add timeout to prevent hanging
          const timeout = setTimeout(() => {
            video.removeEventListener('canplay', onLoad)
            video.removeEventListener('error', onError)
            reject(new Error(`Video load timeout for ${videoPath}`))
          }, 10000) // 10 second timeout

          const onLoad = () => {
            clearTimeout(timeout)
            video.removeEventListener('canplay', onLoad)
            video.removeEventListener('error', onError)
            resolve()
          }

          const onError = (e) => {
            clearTimeout(timeout)
            window.logger.warn('Video failed to load:', videoPath, e)
            video.removeEventListener('canplay', onLoad)
            video.removeEventListener('error', onError)
            reject(e)
          }

          video.addEventListener('canplay', onLoad, { once: true })
          video.addEventListener('error', onError, { once: true })

          // Set video source
          video.src = videoPath
          video.load() // Explicitly trigger load
        })
      }

      if (preloaded?.video) {
        try {
          if (preloaded.video.readyState < 2) {
            await waitForMediaEvent(preloaded.video, 'canplay', 10000)
          }
          video = preloaded.video
          usedPreloadedVideo = true
        } catch (preloadError) {
          window.logger.warn('Preloaded milestone video was not ready, loading normally:', preloadError)
          try {
            preloaded.video.pause()
            preloaded.video.removeAttribute('src')
            if (preloaded.video.parentNode) preloaded.video.parentNode.removeChild(preloaded.video)
          } catch {
            // The normal load path below still plays the milestone.
          }
        }
      }

      // Try multiple video paths when nothing is already buffered.
      let videoLoaded = usedPreloadedVideo
      if (!videoLoaded) {
        const videoPaths = [
          `video/${videoFile}`,
          `/video/${videoFile}`,
          `./video/${videoFile}`
        ]
        for (const path of videoPaths) {
          try {
            await tryLoadVideo(path)
            video = this.overlayElement.querySelector('.milestone-video')
            videoLoaded = true
            break
          } catch (e) {
            window.logger.warn(`Failed to load video from ${path}:`, e)
          }
        }
      }

      if (!videoLoaded) {
        console.error('Failed to load milestone video:', videoFile)
        this.stopCurrentVideo()
        return
      }

      // A usable companion MP3 mutes the picture so narration is not doubled.
      // A missing or failed MP3 plays the audio track embedded in the mp4.
      let audioFromPreload = false
      const preloadedAudio = preloaded?.audio
      const preloadedAudioUnusable = !preloadedAudio || preloaded.audioFailed || preloadedAudio.error
      if (usedPreloadedVideo && preloadedAudio && !preloadedAudioUnusable) {
        this.currentAudio = preloadedAudio
        audioFromPreload = true
      } else if (audioFile) {
        this.currentAudio = await this.loadCompanionAudio(audioFile)
        if (!this.currentAudio) {
          window.logger.warn('No separate milestone MP3. Playing audio embedded in the video.')
        }
      }

      // Keep overlay hidden - only use for video element, render on minimap instead
      this.overlayElement.classList.add('show')
      this.overlayElement.style.opacity = '0' // Hide DOM overlay completely
      this.overlayElement.style.pointerEvents = 'none' // Disable all interactions
      this.isPlaying = true
      this.currentVideo = video
      this.playbackStartedAt = performance.now()
      this.usesEmbeddedAudio = !this.currentAudio
      this.lastAudioFade = 0
      this.rememberMilestoneMute()
      if (video.dataset) {
        video.dataset.milestoneBase = baseFilename
        video.dataset.milestoneAudio = this.usesEmbeddedAudio ? 'embedded' : 'separate'
      }

      if (usedPreloadedVideo) {
        const onEnded = () => {
          setTimeout(() => {
            if (this.isPlaying && this.currentVideo === video) {
              this.stopCurrentVideo()
            }
          }, 100)
        }
        video.addEventListener('ended', onEnded, { once: true })
        video.addEventListener('error', () => {
          if (this.isPlaying && this.currentVideo === video && video.src) {
            this.stopCurrentVideo()
          }
        }, { once: true })
      }

      try {
        const playback = await playMilestoneVideoWithAudioPolicy(
          video,
          !this.usesEmbeddedAudio,
          this.computeMilestoneVolume(0),
          this.milestoneAudioMuted
        )
        if (playback.blockedByAutoplay) {
          window.logger.warn('Unmuted milestone playback was blocked. Picture is muted until the next gesture.')
          this.armEmbeddedUnmuteGesture(video)
        }
      } catch (playError) {
        console.error('Video play() failed:', playError)
        if (playError.name === 'NotAllowedError') {
          window.logger.warn('Video autoplay blocked by browser - user interaction required')
        } else if (playError.name === 'NotSupportedError') {
          window.logger.warn('Video format not supported')
        }
        throw playError
      }

      this.startAudioFadeLoop()

      // Synchronize companion audio. A preloaded MP3 may still be buffering.
      if (this.currentAudio && !this.usesEmbeddedAudio) {
        this.watchCompanionAudio(this.currentAudio, audioFromPreload)
      }

    } catch (error) {
      console.error('Failed to play milestone video:', error)
      // Ensure cleanup happens even if there's an error
      if (this.isPlaying) {
        this.stopCurrentVideo()
      }
    }
  }

  /**
   * Stop current video and play next in queue
   */
  stopCurrentVideo() {
    // Prevent multiple calls during cleanup
    if (!this.isPlaying) {
      return
    }

    this.isPlaying = false
    this.playbackStartedAt = 0
    this.usesEmbeddedAudio = false
    this.stopAudioFadeLoop()
    this.clearEmbeddedUnmuteGesture()

    // Hide overlay completely
    this.overlayElement.classList.remove('show')
    this.overlayElement.style.opacity = '0'
    this.overlayElement.style.pointerEvents = 'none'

    // Stop and clean up video with error handling
    if (this.currentVideo) {
      const playing = this.currentVideo
      const mainVideo = this.overlayElement?.querySelector('.milestone-video')
      try {
        playing.volume = 0
        playing.pause()
        playing.currentTime = 0
        // Remove src to prevent further events
        playing.removeAttribute('src')
        playing.load() // Reset the video element
        if (playing !== mainVideo && playing.parentNode) {
          playing.parentNode.removeChild(playing)
        }
      } catch (e) {
        window.logger.warn('Error during video cleanup:', e)
      } finally {
        this.currentVideo = null
      }
    }

    // Stop and clean up audio with error handling
    if (this.currentAudio) {
      try {
        this.currentAudio.volume = 0
        this.currentAudio.pause()
        this.currentAudio.currentTime = 0
      } catch (e) {
        window.logger.warn('Error during audio cleanup:', e)
      } finally {
        this.currentAudio = null
      }
    }


    // Play next video in queue with improved error handling
    if (this.videoQueue.length > 0) {
      const nextVideo = this.videoQueue.shift()
      setTimeout(() => {
        try {
          this.playMilestoneVideo(nextVideo.videoFile, nextVideo.audioFile, nextVideo.milestoneInfo)
        } catch (e) {
          console.error('Error playing next queued video:', e)
        }
      }, 500) // Small delay between videos
    }
  }

  /**
   * Check if video is currently playing
   */
  isVideoPlaying() {
    return this.isPlaying
  }

  /**
   * Get current video element for canvas rendering
   */
  getCurrentVideo() {
    return this.currentVideo
  }

  /**
   * Opacity used when the minimap paints the current milestone video.
   * Fades in over ~220ms and out over the last ~220ms. Fully opaque in between.
   */
  getMilestoneVideoOpacity(now = performance.now()) {
    const video = this.currentVideo
    return computeMilestoneVideoOpacity(
      this.isVideoPlaying(),
      this.playbackStartedAt,
      now,
      video ? video.duration : NaN,
      video ? video.currentTime : NaN
    )
  }

  /**
   * Get video progress (0-1)
   */
  getVideoProgress() {
    if (!this.currentVideo || !this.currentVideo.duration) {
      return 0
    }
    return this.currentVideo.currentTime / this.currentVideo.duration
  }

  /**
   * Clear video queue
   */
  clearQueue() {
    this.videoQueue = []
  }

  /**
   * Destroy the overlay
   */
  destroy() {
    this.stopCurrentVideo()
    this.clearQueue()
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement)
    }
  }

  /**
   * Master volume is the game's only mixer. Zero master volume, and headless
   * test mute, silence both the companion MP3 and the embedded track.
   * SFX and voice stay fully open because those channels are not separate sliders.
   */
  rememberMilestoneMute() {
    const master = getMasterVolume()
    this.milestoneMasterVolume = master
    this.milestoneAudioMuted = master <= 0 || isHeadlessAudioMuted()
  }

  computeMilestoneVolume(fade) {
    return resolveMilestonePlaybackVolume(
      this.milestoneMasterVolume,
      1,
      1,
      this.milestoneAudioMuted,
      fade
    )
  }

  /**
   * Fade milestone audio with the radar opacity. One rAF while a clip plays.
   * No per-frame objects. Companion MP3 and embedded video audio share this.
   */
  applyMilestoneAudioFade(opacity) {
    const fade = opacity > 0 ? (opacity < 1 ? opacity : 1) : 0
    this.lastAudioFade = fade
    const volume = this.computeMilestoneVolume(fade)
    if (this.currentAudio) this.currentAudio.volume = volume
    const video = this.currentVideo
    if (!this.usesEmbeddedAudio || !video || this.embeddedUnmutePending || video.muted) return
    video.volume = volume
  }

  startAudioFadeLoop() {
    if (this.audioFadeFrame) return
    this.audioFadeFrame = requestAnimationFrame(this.boundAudioFadeStep)
  }

  stopAudioFadeLoop() {
    if (!this.audioFadeFrame) return
    cancelAnimationFrame(this.audioFadeFrame)
    this.audioFadeFrame = 0
  }

  clearEmbeddedUnmuteGesture() {
    const retry = this.embeddedUnmuteRetry
    this.embeddedUnmuteRetry = null
    this.embeddedUnmutePending = false
    if (!retry || typeof window === 'undefined') return
    window.removeEventListener('pointerdown', retry, true)
    window.removeEventListener('keydown', retry, true)
  }

  armEmbeddedUnmuteGesture(video) {
    this.clearEmbeddedUnmuteGesture()
    if (!video || typeof window === 'undefined') return
    this.embeddedUnmutePending = true
    const retry = () => {
      window.removeEventListener('pointerdown', retry, true)
      window.removeEventListener('keydown', retry, true)
      if (this.embeddedUnmuteRetry === retry) this.embeddedUnmuteRetry = null
      if (!this.embeddedUnmutePending) return
      this.embeddedUnmutePending = false
      if (!this.isPlaying || !this.usesEmbeddedAudio || this.currentVideo !== video) return
      this.rememberMilestoneMute()
      if (this.milestoneAudioMuted) return
      const volume = this.computeMilestoneVolume(this.lastAudioFade > 0 ? this.lastAudioFade : 1)
      applyMilestoneVideoAudioState(video, false, volume)
      const pending = video.play()
      if (pending && typeof pending.catch === 'function') {
        pending.catch(error => {
          if (error?.name !== 'NotAllowedError') return
          if (!this.isPlaying || this.currentVideo !== video) return
          applyMilestoneVideoAudioState(video, true, 0)
          this.armEmbeddedUnmuteGesture(video)
        })
      }
    }
    this.embeddedUnmuteRetry = retry
    window.addEventListener('pointerdown', retry, true)
    window.addEventListener('keydown', retry, true)
  }

  loadCompanionAudio(audioFile) {
    const audioPaths = [
      `video/${audioFile}`,
      `/video/${audioFile}`,
      `./video/${audioFile}`
    ]
    const tryPath = (path) => new Promise((resolve, reject) => {
      const audio = new Audio()
      audio.preload = 'auto'
      let settled = false
      const finish = (handler, value) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        audio.removeEventListener('canplaythrough', onLoad)
        audio.removeEventListener('error', onError)
        handler(value)
      }
      const timeout = setTimeout(() => {
        finish(reject, new Error(`Audio load timeout for ${path}`))
      }, 4000)
      const onLoad = () => finish(resolve, audio)
      const onError = (event) => finish(reject, event)
      audio.addEventListener('canplaythrough', onLoad, { once: true })
      audio.addEventListener('error', onError, { once: true })
      audio.src = path
      if (audio.error) {
        finish(reject, audio.error)
        return
      }
      audio.load()
    })

    return (async() => {
      for (const path of audioPaths) {
        try {
          return await tryPath(path)
        } catch (error) {
          window.logger.warn(`Failed to load audio from ${path}:`, error)
        }
      }
      return null
    })()
  }

  watchCompanionAudio(audio, audioFromPreload) {
    const startAudio = () => {
      if (!this.isPlaying || this.currentAudio !== audio || this.usesEmbeddedAudio) return
      audio.volume = this.computeMilestoneVolume(this.lastAudioFade)
      const pending = audio.play()
      if (!pending || typeof pending.catch !== 'function') return
      pending.catch(error => {
        window.logger.warn('Audio playback failed:', error)
        if (this.currentAudio !== audio) return
        this.switchToEmbeddedAudio()
      })
    }
    const onAudioError = () => {
      if (this.currentAudio !== audio) return
      this.switchToEmbeddedAudio()
    }
    audio.addEventListener('error', onAudioError, { once: true })
    if (!audioFromPreload || audio.readyState >= 2) {
      setTimeout(startAudio, 50)
      return
    }
    audio.addEventListener('canplay', () => setTimeout(startAudio, 50), { once: true })
  }

  switchToEmbeddedAudio() {
    const audio = this.currentAudio
    this.currentAudio = null
    this.usesEmbeddedAudio = true
    if (audio) {
      try {
        audio.volume = 0
        audio.pause()
      } catch (error) {
        window.logger.warn('Error stopping failed milestone MP3:', error)
      }
    }
    const video = this.currentVideo
    if (!video || !this.isPlaying) return
    if (video.dataset) video.dataset.milestoneAudio = 'embedded'
    this.embeddedUnmutePending = false
    const volume = this.computeMilestoneVolume(this.lastAudioFade > 0 ? this.lastAudioFade : 1)
    playMilestoneVideoWithAudioPolicy(video, false, volume, this.milestoneAudioMuted).then(playback => {
      if (!this.isPlaying || this.currentVideo !== video) return
      if (playback.blockedByAutoplay) this.armEmbeddedUnmuteGesture(video)
    }).catch(error => {
      window.logger.warn('Embedded milestone audio failed:', error)
    })
  }

  /**
   * Update the volume of current audio to match master volume
   */
  updateAudioVolume() {
    this.rememberMilestoneMute()
    if (!this.isPlaying) return
    const video = this.currentVideo
    if (this.usesEmbeddedAudio && video && !this.embeddedUnmutePending) {
      if (this.milestoneAudioMuted) {
        applyMilestoneVideoAudioState(video, true, 0)
      } else if (video.muted) {
        applyMilestoneVideoAudioState(video, false, this.computeMilestoneVolume(this.lastAudioFade))
      }
    }
    this.applyMilestoneAudioFade(this.lastAudioFade)
  }
}

// Create global instance
export const videoOverlay = new VideoOverlay()

/**
 * Convenience function for playing milestone videos by base filename
 */
export function playMilestoneVideo(videoFile, audioFile, milestoneInfo) {
  return videoOverlay.playMilestoneVideo(videoFile, audioFile, milestoneInfo)
}

/**
 * Convenience function for playing video and audio in sync by base filename
 * @param {string} baseFilename - The base filename without extension (e.g., 'tank_over_crystals')
 * @param {object} options - Optional settings for the video playback
 */
export function playSyncedVideoAudio(baseFilename, options = {}) {
  const videoFile = `${baseFilename}.mp4`
  const audioFile = `${baseFilename}.mp3`

  const milestoneInfo = {
    title: options.title || 'Video Playback',
    description: options.description || '',
    priority: options.priority || 'medium'
  }

  return videoOverlay.playMilestoneVideo(videoFile, audioFile, milestoneInfo)
}

/**
 * Update video audio volume to match current master volume
 * Can be called externally when master volume changes
 */
export function updateVideoAudioVolume() {
  videoOverlay.updateAudioVolume()
}
