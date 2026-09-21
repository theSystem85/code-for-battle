export class FrameViewport {
  constructor() {
    this.revision = 0
    this.logicalWidth = 0
    this.logicalHeight = 0
    this.backingWidth = 0
    this.backingHeight = 0
    this.density = 1
    this.worldLeft = 0
    this.worldTop = 0
    this.worldRight = 0
    this.worldBottom = 0
  }

  update({ logicalWidth, logicalHeight, backingWidth, backingHeight, density, worldLeft, worldTop }) {
    const changed = logicalWidth !== this.logicalWidth || logicalHeight !== this.logicalHeight ||
      backingWidth !== this.backingWidth || backingHeight !== this.backingHeight || density !== this.density ||
      worldLeft !== this.worldLeft || worldTop !== this.worldTop
    if (!changed) return false
    this.logicalWidth = logicalWidth
    this.logicalHeight = logicalHeight
    this.backingWidth = backingWidth
    this.backingHeight = backingHeight
    this.density = density
    this.worldLeft = worldLeft
    this.worldTop = worldTop
    this.worldRight = worldLeft + logicalWidth
    this.worldBottom = worldTop + logicalHeight
    this.revision++
    return true
  }
}
