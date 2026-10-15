import { describe, it, expect, vi, beforeEach } from 'vitest'
import '../setup.js'
import { MilestoneSystem, FIRST_UNIT_VIDEO_MILESTONES, FIRST_BUILDING_VIDEO_MILESTONES } from '../../src/game/milestoneSystem.js'
import { playSyncedVideoAudio } from '../../src/ui/videoOverlay.js'
import { firstProductionNarrationMilestoneId } from '../../src/ui/milestoneMediaCache.js'

vi.mock('../../src/ui/videoOverlay.js', () => ({ playSyncedVideoAudio: vi.fn() }))
vi.mock('../../src/ui/notifications.js', () => ({ showNotification: vi.fn() }))

const UNIT_CASES = [
  ['f35', 'firstF35', 'first_f35'],
  ['f22Raptor', 'firstF22', 'first_f22'],
  ['apache', 'firstApache', 'first_apache'],
  ['destroyer', 'firstDestroyer', 'first_destroyer'],
  ['battleship', 'firstBattleship', 'first_battleship'],
  ['submarine', 'firstSubmarine', 'first_submarine']
]
const BUILDING_CASES = [
  ['shipyard', 'firstShipyard', 'shipyard'],
  ['helipad', 'firstHelipad', 'helipad']
]

describe('air and naval milestone videos', () => {
  let system
  beforeEach(() => {
    vi.clearAllMocks()
    system = new MilestoneSystem()
  })

  it('exposes one trigger per new milestone', () => {
    expect(FIRST_UNIT_VIDEO_MILESTONES).toHaveLength(UNIT_CASES.length)
    expect(FIRST_BUILDING_VIDEO_MILESTONES).toHaveLength(BUILDING_CASES.length)
  })

  it.each(UNIT_CASES)('plays the %s video once for the local player', (type, id, video) => {
    const state = { humanPlayer: 'player1', buildings: [], units: [{ type, owner: 'player1' }] }
    system.checkMilestones(state)
    expect(system.isAchieved(id)).toBe(true)
    expect(playSyncedVideoAudio).toHaveBeenCalledWith(video, expect.objectContaining({ priority: 'high' }))
    vi.clearAllMocks()
    state.units.push({ type, owner: 'player1' })
    system.checkMilestones(state)
    expect(playSyncedVideoAudio).not.toHaveBeenCalledWith(video, expect.anything())
    expect(firstProductionNarrationMilestoneId(type)).toBe(id)
  })

  it.each(BUILDING_CASES)('plays the %s building video once', (type, id, video) => {
    system.checkMilestones({ humanPlayer: 'player1', buildings: [{ type, owner: 'player1' }], units: [] })
    expect(system.isAchieved(id)).toBe(true)
    expect(playSyncedVideoAudio).toHaveBeenCalledWith(video, expect.anything())
  })

  it('ignores enemy units and buildings', () => {
    system.checkMilestones({
      humanPlayer: 'player1',
      units: UNIT_CASES.map(([type]) => ({ type, owner: 'enemy1' })),
      buildings: BUILDING_CASES.map(([type]) => ({ type, owner: 'enemy1' }))
    })
    for (const [, id] of [...UNIT_CASES, ...BUILDING_CASES]) expect(system.isAchieved(id)).toBe(false)
  })

  it('does not replay after restoring achieved milestones', () => {
    system.setAchievedMilestones(['firstF35', 'firstShipyard'])
    system.checkMilestones({ humanPlayer: 'player1', units: [{ type: 'f35', owner: 'player1' }], buildings: [{ type: 'shipyard', owner: 'player1' }] })
    expect(playSyncedVideoAudio).not.toHaveBeenCalled()
  })
})
