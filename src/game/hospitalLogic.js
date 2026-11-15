import { TILE_SIZE } from '../config.js'
import { logPerformance } from '../performanceUtils.js'
import { getServiceRadiusPixels } from '../utils/serviceRadius.js'
import { playSound } from '../sound.js'
export const updateHospitalLogic = logPerformance(function(units, buildings, gameState, delta) {
  const hospitals = buildings.filter(b => b.type === 'hospital')
  if (hospitals.length === 0) return
  hospitals.forEach(hospital => {
    const serviceRadius = getServiceRadiusPixels(hospital)
    if (serviceRadius <= 0) return

    // Initialize healing tracking if not present
    if (!hospital.healingUnits) {
      hospital.healingUnits = []
    }

    const centerX = hospital.x * TILE_SIZE + (hospital.width * TILE_SIZE) / 2
    const centerY = hospital.y * TILE_SIZE + (hospital.height * TILE_SIZE) / 2

    // Clear healing units that are no longer in range or don't need healing
    hospital.healingUnits = hospital.healingUnits.filter(healing => {
      const unit = units.find(u => u.id === healing.unitId)
      if (!unit) return false

      const unitCenterX = (unit.x ?? unit.tileX * TILE_SIZE) + TILE_SIZE / 2
      const unitCenterY = (unit.y ?? unit.tileY * TILE_SIZE) + TILE_SIZE / 2
      const distance = Math.hypot(unitCenterX - centerX, unitCenterY - centerY)
      const inArea = distance <= serviceRadius

      if (!inArea) return false

      // Check if unit still needs healing
      if (!unit.crew || typeof unit.crew !== 'object') return false
      const missingRoles = Object.keys(unit.crew).filter(role => !unit.crew[role])
      return missingRoles.length > 0
    })

    units.forEach(unit => {
      if (!unit.crew || typeof unit.crew !== 'object') return
      // Skip ambulances for AI players as they don't use the crew system
      if ((unit.owner !== gameState.humanPlayer) && (unit.type === 'ambulance')) return
      const unitCenterX = (unit.x ?? unit.tileX * TILE_SIZE) + TILE_SIZE / 2
      const unitCenterY = (unit.y ?? unit.tileY * TILE_SIZE) + TILE_SIZE / 2
      const distance = Math.hypot(unitCenterX - centerX, unitCenterY - centerY)
      const inArea = distance <= serviceRadius

      if (inArea) {
        const healInterval = 10000
        const healOrder = ['driver', 'commander', 'loader', 'gunner']

        // Find or create healing entry for this unit
        let healingEntry = hospital.healingUnits.find(h => h.unitId === unit.id)
        if (!healingEntry) {
          const missingRoles = Object.keys(unit.crew).filter(role => !unit.crew[role])
          if (missingRoles.length > 0) {
            healingEntry = {
              unitId: unit.id,
              progress: 0,
              totalProgress: healInterval,
              currentRole: healOrder.find(role => missingRoles.includes(role)) || missingRoles[0]
            }
            hospital.healingUnits.push(healingEntry)
          }
        }

        if (healingEntry) {
          healingEntry.progress += delta

          // Check if healing is complete for current role
          if (healingEntry.progress >= healingEntry.totalProgress) {
            // Heal the current role
            unit.crew[healingEntry.currentRole] = true
            healingEntry.progress -= healingEntry.totalProgress
            if (unit.owner === gameState.humanPlayer) playSound('crewRestored', 0.8, 1.2)

            // Only deduct money from human player
            if (unit.owner === gameState.humanPlayer && gameState.money >= 10) {
              gameState.money -= 10
            }

            // Find next role to heal
            const missingRoles = Object.keys(unit.crew).filter(role => !unit.crew[role])
            const nextRole = healOrder.find(role => missingRoles.includes(role)) || missingRoles[0]

            if (nextRole) {
              healingEntry.currentRole = nextRole
              healingEntry.progress = 0
            } else {
              // All roles healed, remove from healing list
              hospital.healingUnits = hospital.healingUnits.filter(h => h.unitId !== unit.id)
            }
          }
        }
      } else {
        // Unit moved out of range, remove from healing
        hospital.healingUnits = hospital.healingUnits.filter(h => h.unitId !== unit.id)
      }
    })

    // Handle ambulance medic refills (separate from crew healing)
    units.forEach(unit => {
      // Only refill at friendly hospitals (matching owner)
      if (unit.type === 'ambulance' && typeof unit.medics === 'number' && unit.owner === hospital.owner) {
        const unitCenterX = (unit.x ?? unit.tileX * TILE_SIZE) + TILE_SIZE / 2
        const unitCenterY = (unit.y ?? unit.tileY * TILE_SIZE) + TILE_SIZE / 2
        const distance = Math.hypot(unitCenterX - centerX, unitCenterY - centerY)
        const inArea = distance <= serviceRadius

        if (inArea) {
          const maxMedics = typeof unit.maxMedics === 'number' && unit.maxMedics > 0 ? unit.maxMedics : 10
          if (unit.medics < maxMedics) {
            unit.medicRefillTimer = (unit.medicRefillTimer || 0) + delta
            const restockInterval = 2000  // 2 seconds per medic refill

            while (unit.medics < maxMedics && unit.medicRefillTimer >= restockInterval) {
              unit.medics += 1
              unit.medicRefillTimer -= restockInterval
            }

            if (unit.medics > maxMedics) {
              unit.medics = maxMedics
            }
          } else {
            unit.medicRefillTimer = 0
          }
        } else {
          unit.medicRefillTimer = 0
        }
      }
    })
  })
})
