import { describe, it, expect } from 'vitest'
import { MILESTONE_VIDEO_CROPS } from '../../src/ui/milestoneVideoCrop.js'

describe('milestone video crop entries', () => {
  it('[U07150] radar station and first factory clips are full-frame 5:3 and need no crop', () => {
    expect(MILESTONE_VIDEO_CROPS.radar_station).toBe(MILESTONE_VIDEO_CROPS.first_factory)
    expect(MILESTONE_VIDEO_CROPS.radar_station).toEqual(MILESTONE_VIDEO_CROPS.helipad)
  })

  it('[U07155] ten buildings and harvester unlock clips are full-frame 5:3 and need no crop', () => {
    expect(MILESTONE_VIDEO_CROPS.ten_buildings).toBe(MILESTONE_VIDEO_CROPS.first_factory)
    expect(MILESTONE_VIDEO_CROPS.harvester_unlocked).toBe(MILESTONE_VIDEO_CROPS.first_factory)
    expect(MILESTONE_VIDEO_CROPS.ten_buildings).toEqual(MILESTONE_VIDEO_CROPS.helipad)
  })

  it('[U07158] recovery tank and heavy tank unlock clips are full-frame 5:3 and need no crop', () => {
    expect(MILESTONE_VIDEO_CROPS.recovery_tank_unlocked).toBe(MILESTONE_VIDEO_CROPS.first_factory)
    expect(MILESTONE_VIDEO_CROPS.heavy_tank_unlocked).toBe(MILESTONE_VIDEO_CROPS.first_factory)
    expect(MILESTONE_VIDEO_CROPS.recovery_tank_unlocked).toEqual(MILESTONE_VIDEO_CROPS.helipad)
  })
})
