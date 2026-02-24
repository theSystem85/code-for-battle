// ui/videoOverlay.js
import { getMasterVolume } from '../sound.js'

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
        height: 110px;
        object-fit: cover;
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
      const video = this.overlayElement.querySelector('.milestone-video')
      const titleElement = this.overlayElement.querySelector('.milestone-title')
      const descriptionElement = this.overlayElement.querySelector('.milestone-description')

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

      // Try multiple video paths
      const videoPaths = [
        `video/${videoFile}`,
        `/video/${videoFile}`,
        `./video/${videoFile}`
      ]

      let videoLoaded = false
      for (const path of videoPaths) {
        try {
          await tryLoadVideo(path)
          videoLoaded = true
          break
        } catch (e) {
          window.logger.warn(`Failed to load video from ${path}:`, e)
        }
      }

      if (!videoLoaded) {
        console.error('Failed to load video from all attempted paths:', videoPaths)
        this.stopCurrentVideo()
        return
      }

      // Load and play audio with error handling
      if (audioFile) {
        const audioPaths = [
          `video/${audioFile}`,
          `/video/${audioFile}`,
          `./video/${audioFile}`
        ]

        let audioLoaded = false
        for (const path of audioPaths) {
          try {
            this.currentAudio = new Audio(path)
            this.currentAudio.volume = 0.28 * getMasterVolume() // Apply master volume to video audio (60% quieter)

            // Test if audio can load
            await new Promise((resolve, reject) => {
              const onLoad = () => {
                this.currentAudio.removeEventListener('canplaythrough', onLoad)
                this.currentAudio.removeEventListener('error', onError)
                resolve()
              }
              const onError = (e) => {
                this.currentAudio.removeEventListener('canplaythrough', onLoad)
                this.currentAudio.removeEventListener('error', onError)
                reject(e)
              }
              this.currentAudio.addEventListener('canplaythrough', onLoad, { once: true })
              this.currentAudio.addEventListener('error', onError, { once: true })
            })

            audioLoaded = true
            break
          } catch (e) {
            window.logger.warn(`Failed to load audio from ${path}:`, e)
            if (this.currentAudio) {
              this.currentAudio = null
            }
          }
        }

        if (!audioLoaded) {
          window.logger.warn('Failed to load audio from all attempted paths, video will play without separate sound. Re-enabling embedded video audio.')
          this.currentAudio = null
        }
      }

      // Configure video volume based on separate audio presence
      if (this.currentAudio) {
        video.muted = true
      } else {
        video.muted = false
        video.volume = 0.28 * getMasterVolume()
      }

      // Keep overlay hidden - only use for video element, render on minimap instead
      this.overlayElement.classList.add('show')
      this.overlayElement.style.opacity = '0' // Hide DOM overlay completely
      this.overlayElement.style.pointerEvents = 'none' // Disable all interactions
      this.isPlaying = true
      this.currentVideo = video

      // Start video playback with error handling
      try {
        await video.play()
      } catch (playError) {
        console.error('Video play() failed:', playError)
        // Try to handle specific play errors
        if (playError.name === 'NotAllowedError') {
          window.logger.warn('Video autoplay blocked by browser - user interaction required')
        } else if (playError.name === 'NotSupportedError') {
          window.logger.warn('Video format not supported')
        }
        throw playError // Re-throw to be caught by outer try-catch
      }

      // Synchronize audio
      if (this.currentAudio) {
        // Small delay to account for video start time
        setTimeout(() => {
          if (this.isPlaying && this.currentAudio) {
            this.currentAudio.play().catch(e => {
              window.logger.warn('Audio playback failed:', e)
            })
          }
        }, 50)
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

    // Hide overlay completely
    this.overlayElement.classList.remove('show')
    this.overlayElement.style.opacity = '0'
    this.overlayElement.style.pointerEvents = 'none'

    // Stop and clean up video with error handling
    if (this.currentVideo) {
      try {
        this.currentVideo.pause()
        this.currentVideo.currentTime = 0
        // Remove src to prevent further events
        this.currentVideo.removeAttribute('src')
        this.currentVideo.load() // Reset the video element
      } catch (e) {
        window.logger.warn('Error during video cleanup:', e)
      } finally {
        this.currentVideo = null
      }
    }

    // Stop and clean up audio with error handling
    if (this.currentAudio) {
      try {
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
   * Update the volume of current audio to match master volume
   */
  updateAudioVolume() {
    if (this.currentAudio) {
      this.currentAudio.volume = 0.28 * getMasterVolume()
    }
    if (this.currentVideo && !this.currentVideo.muted) {
      this.currentVideo.volume = 0.28 * getMasterVolume()
    }
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
