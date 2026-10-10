import { prewarmSpriteSheetTexture } from './spriteSheetAnimation.js'

// A presentation-only swap. Cached jobs may finish ahead of older worker
// jobs, so completion order must never choose the active editor selection.
export class AnimationSheetPreparation {
  constructor(state, prepare = prewarmSpriteSheetTexture) {
    this.state = state
    this.prepare = prepare
    this.generation = 0
    this.pending = false
  }

  async stage(metadata, path) {
    const generation = ++this.generation
    this.pending = true
    try {
      await this.prepare(path)
      if (generation !== this.generation) return
      this.state.activeAnimationSpriteSheetMetadata = metadata
      this.state.activeAnimationSpriteSheetPath = path
    } finally {
      if (generation === this.generation) this.pending = false
    }
  }
}
