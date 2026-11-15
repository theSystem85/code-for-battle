import { describe, it, expect } from 'vitest'
import { MILESTONE_VIDEO_CROPS } from '../../src/ui/milestoneVideoCrop.js'

describe('milestone video crop entries', () => {
  it('[U07150] radar station and first factory clips are full-frame 5:3 and need no crop', () => {
    expect(MILESTONE_VIDEO_CROPS.radar_station).toBe(MILESTONE_VIDEO_CROPS.first_factory)
    expect(MILESTONE_VIDEO_CROPS.radar_station).toEqual(MILESTONE_VIDEO_CROPS.helipad)
  })
})
