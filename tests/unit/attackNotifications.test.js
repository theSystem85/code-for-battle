import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleAttackNotification, resetAttackNotifications } from '../../src/game/attackNotifications.js'
import { playSound } from '../../src/sound.js'
import { showNotification } from '../../src/ui/notifications.js'
import { gameState } from '../../src/gameState.js'

// Mock dependencies
vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/inputHandler.js', () => ({
  selectedUnits: []
}))

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: () => 800,
  getPlayableViewportHeight: () => 600
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1'
  }
}))

describe('attackNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAttackNotifications()
    gameState.humanPlayer = 'player1'
  })

  describe('handleAttackNotification', () => {
    const NOW = 70000 // Start later than 60s to ensure cooldown checks pass against 0 initialization
    const MINUTE = 60000

    it('[U00250] triggers "ourBaseIsUnderAttack" when player base building is attacked by enemy', () => {
      const target = { owner: 'player1', type: 'constructionYard' }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).toHaveBeenCalledWith('ourBaseIsUnderAttack', 1.0, 0, true)
    })

    it('[U00251] triggers "ourHarvestersAreUnderAttack" when player harvester is attacked by enemy', () => {
      const target = { owner: 'player1', type: 'harvester' }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).toHaveBeenCalledWith('ourHarvestersAreUnderAttack', 1.0, 0, true)
    })

    it('[U00252] respects 60s cooldown for base attack notifications', () => {
      const target = { owner: 'player1', type: 'constructionYard' }
      const attacker = { owner: 'enemy' }

      // First attack triggers notification
      handleAttackNotification(target, attacker, NOW)
      expect(playSound).toHaveBeenCalledTimes(1)

      // Attack 30s later - should NOT trigger
      handleAttackNotification(target, attacker, NOW + 30000)
      expect(playSound).toHaveBeenCalledTimes(1)

      // Attack 61s later - should trigger again
      handleAttackNotification(target, attacker, NOW + MINUTE + 100)
      expect(playSound).toHaveBeenCalledTimes(2)
    })

    it('[U00253] respects 60s cooldown for harvester attack notifications', () => {
      const target = { owner: 'player1', type: 'harvester' }
      const attacker = { owner: 'enemy' }

      // First attack triggers notification
      handleAttackNotification(target, attacker, NOW)
      expect(playSound).toHaveBeenCalledTimes(1)

      // Attack 30s later - should NOT trigger
      handleAttackNotification(target, attacker, NOW + 30000)
      expect(playSound).toHaveBeenCalledTimes(1)

      // Attack 61s later - should trigger again
      handleAttackNotification(target, attacker, NOW + MINUTE + 100)
      expect(playSound).toHaveBeenCalledTimes(2)
    })

    it('[U00254] does NOT trigger if attacker is player owned', () => {
      const target = { owner: 'player1', type: 'constructionYard' }
      const attacker = { owner: 'player1' } // Friendly fire

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).not.toHaveBeenCalled()
    })

    it('[U00255] does NOT trigger if target is not player owned', () => {
      const target = { owner: 'enemy', type: 'constructionYard' }
      const attacker = { owner: 'player1' } // Player attacking enemy base

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).not.toHaveBeenCalled()
    })

    it('[U00256] recognizes various base buildings', () => {
      const buildings = [
        'powerPlant',
        'oreRefinery',
        'vehicleFactory',
        'barracks',
        'warFactory',
        'techCenter',
        'communications',
        'radar'
      ]

      const attacker = { owner: 'enemy' }
      const currentTime = NOW

      buildings.forEach(type => {
        const target = { owner: 'player1', type }
        // We need to reset notifications or advance time significantly to test each one individually if they share the cooldown?
        // Ah, the cooldown is global for "base attack". So testing them all in sequence requires resetting or advancing time.
        // Let's reset for each check to keep it simple.
        resetAttackNotifications()

        handleAttackNotification(target, attacker, currentTime)
        expect(playSound).toHaveBeenLastCalledWith('ourBaseIsUnderAttack', 1.0, 0, true)
      })
    })

    it('[U00257] recognizes entity with ID matching humanPlayer as base', () => {
      // Logic: if (entity.id && entity.id === gameState.humanPlayer) return true
      const target = { owner: 'player1', id: 'player1' }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).toHaveBeenCalledWith('ourBaseIsUnderAttack', 1.0, 0, true)
    })

    it('[U00258] handles legacy owner "player" as player owned when humanPlayer is "player1"', () => {
      gameState.humanPlayer = 'player1'
      const target = { owner: 'player', type: 'constructionYard' }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).toHaveBeenCalledWith('ourBaseIsUnderAttack', 1.0, 0, true)
    })

    it.each([
      ['ourBattleshipGotAttacked', 'battleship'],
      ['ourSubmarineGotAttacked', 'submarine'],
      ['ourCarrierGotAttacked', 'aircraftCarrier'],
      ['ourHovercraftGotAttacked', 'hovercraft'],
      ['ourShipsGotAttacked', 'destroyer'],
      ['ourShipsGotAttacked', 'supplyShip'],
      ['ourShipsGotAttacked', 'vehicleFerry'],
      ['ourShipsGotAttacked', 'navalMineLayer']
    ])('[U00259] plays %s when a player %s is attacked', (soundName, unitType) => {
      const target = { id: `${unitType}-1`, owner: 'player1', type: unitType, isNaval: true, health: 100 }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).toHaveBeenCalledWith(soundName, 1.0, 0, true)
      expect(showNotification).toHaveBeenCalled()
    })

    it('[U00260] keeps a separate 60s cooldown for each naval narration line', () => {
      const attacker = { owner: 'enemy' }
      const battleship = { id: 'bb-1', owner: 'player1', type: 'battleship', isNaval: true, health: 100 }
      const destroyer = { id: 'dd-1', owner: 'player1', type: 'destroyer', isNaval: true, health: 100 }

      handleAttackNotification(battleship, attacker, NOW)
      handleAttackNotification(destroyer, attacker, NOW)
      handleAttackNotification(battleship, attacker, NOW + 1000)

      expect(playSound).toHaveBeenCalledTimes(2)
      expect(playSound).toHaveBeenNthCalledWith(1, 'ourBattleshipGotAttacked', 1.0, 0, true)
      expect(playSound).toHaveBeenNthCalledWith(2, 'ourShipsGotAttacked', 1.0, 0, true)

      handleAttackNotification(battleship, attacker, NOW + MINUTE + 100)
      expect(playSound).toHaveBeenLastCalledWith('ourBattleshipGotAttacked', 1.0, 0, true)
    })

    it('[U00261] does not narrate enemy naval units or non-naval units', () => {
      handleAttackNotification(
        { id: 'enemy-bb', owner: 'enemy', type: 'battleship', isNaval: true, health: 100 },
        { owner: 'player1' },
        NOW
      )
      handleAttackNotification(
        { id: 'tank-2', owner: 'player1', type: 'tank_v1', health: 100 },
        { owner: 'enemy' },
        NOW
      )

      expect(playSound).not.toHaveBeenCalled()
    })

    it('[U00262] shows a unit under attack notification for player non-base non-harvester units', () => {
      const target = { id: 'tank-1', owner: 'player1', type: 'tank_v1', health: 100 }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)

      expect(playSound).not.toHaveBeenCalled()
      expect(showNotification).toHaveBeenCalledWith('Tank is under attack!', 4500, expect.objectContaining({ historyMessage: 'Tank is under attack!' }))
    })

    it('[U00263] throttles unit under attack notifications per unit id', () => {
      const target = { id: 'tank-1', owner: 'player1', type: 'tank_v1', health: 100 }
      const attacker = { owner: 'enemy' }

      handleAttackNotification(target, attacker, NOW)
      handleAttackNotification(target, attacker, NOW + 1000)

      expect(showNotification).toHaveBeenCalledTimes(1)

      handleAttackNotification(target, attacker, NOW + 9000)
      expect(showNotification).toHaveBeenCalledTimes(2)
    })
  })

  describe('resetAttackNotifications', () => {
    it('[U00264] resets the cooldowns so notifications can trigger immediately again', () => {
      const NOW = 70000
      const targetBase = { owner: 'player1', type: 'constructionYard' }
      const targetHarvester = { owner: 'player1', type: 'harvester' }
      const attacker = { owner: 'enemy' }

      // Use up cooldowns
      handleAttackNotification(targetBase, attacker, NOW)
      handleAttackNotification(targetHarvester, attacker, NOW)
      expect(playSound).toHaveBeenCalledTimes(2)

      // Try again immediately - should fail
      handleAttackNotification(targetBase, attacker, NOW + 100)
      handleAttackNotification(targetHarvester, attacker, NOW + 100)
      expect(playSound).toHaveBeenCalledTimes(2)

      // Reset
      resetAttackNotifications()

      // Should work immediately
      handleAttackNotification(targetBase, attacker, NOW + 200) // Small increment
      expect(playSound).toHaveBeenCalledTimes(3)
      expect(playSound).toHaveBeenLastCalledWith('ourBaseIsUnderAttack', 1.0, 0, true)

      handleAttackNotification(targetHarvester, attacker, NOW + 200)
      expect(playSound).toHaveBeenCalledTimes(4)
      expect(playSound).toHaveBeenLastCalledWith('ourHarvestersAreUnderAttack', 1.0, 0, true)
    })
  })
})
